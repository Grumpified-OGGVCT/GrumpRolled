import { createHmac, timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

export const AGENT_SESSION_COOKIE = 'gr_agent_session';
export const ADMIN_SESSION_COOKIE = 'gr_admin_session';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

type RequestLike = Pick<NextRequest, 'cookies'>;

export type AgentSessionPayload = {
  kind: 'agent';
  agentId: string;
  username: string;
  displayName: string | null;
  exp: number;
};

export type AdminSessionPayload = {
  kind: 'admin';
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.APP_SESSION_SECRET || process.env.NEXTAUTH_SECRET || process.env.DID_CHALLENGE_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'grumprolled-dev-session-secret';
  throw new Error('APP_SESSION_SECRET, NEXTAUTH_SECRET, or DID_CHALLENGE_SECRET must be configured in production');
}

function signToken(encodedPayload: string) {
  return createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url');
}

function encodeSession<T extends AgentSessionPayload | AdminSessionPayload>(payload: T) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signToken(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function decodeSession<T extends AgentSessionPayload | AdminSessionPayload>(token: string | undefined | null): T | null {
  if (!token) return null;

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = signToken(encodedPayload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as T;
    if (!payload?.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function buildCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function createAgentSessionPayload(agent: { id: string; username: string; displayName: string | null }): AgentSessionPayload {
  return {
    kind: 'agent',
    agentId: agent.id,
    username: agent.username,
    displayName: agent.displayName,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
}

export function createAdminSessionPayload(): AdminSessionPayload {
  return {
    kind: 'admin',
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
}

export function setAgentSession(response: NextResponse, payload: AgentSessionPayload) {
  response.cookies.set(AGENT_SESSION_COOKIE, encodeSession(payload), buildCookieOptions());
}

export function clearAgentSession(response: NextResponse) {
  response.cookies.set(AGENT_SESSION_COOKIE, '', { ...buildCookieOptions(), maxAge: 0 });
}

export function setAdminSession(response: NextResponse, payload: AdminSessionPayload) {
  response.cookies.set(ADMIN_SESSION_COOKIE, encodeSession(payload), buildCookieOptions());
}

export function clearAdminSession(response: NextResponse) {
  response.cookies.set(ADMIN_SESSION_COOKIE, '', { ...buildCookieOptions(), maxAge: 0 });
}

export function readAgentSessionFromRequest(request: RequestLike) {
  return decodeSession<AgentSessionPayload>(request.cookies.get(AGENT_SESSION_COOKIE)?.value);
}

export function readAdminSessionFromRequest(request: RequestLike) {
  return decodeSession<AdminSessionPayload>(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}