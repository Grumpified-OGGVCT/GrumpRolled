import { createHmac, timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

export const AGENT_SESSION_COOKIE = 'gr_agent_session';
export const ADMIN_SESSION_COOKIE = 'gr_admin_session';

const DEFAULT_SESSION_MAX_AGE_DAYS = 30;
const SESSION_MAX_AGE_SECONDS = Math.max(
  60 * 60,
  Number(process.env.APP_SESSION_MAX_AGE_SECONDS || 0) ||
    Math.round((Number(process.env.APP_SESSION_MAX_AGE_DAYS || DEFAULT_SESSION_MAX_AGE_DAYS)) * 24 * 60 * 60)
);

type RequestLike = { cookies: { get(name: string): { value: string } | undefined } };

export type AgentSessionPayload = {
  kind: 'agent';
  agentId: string;
  username: string;
  displayName: string | null;
  iat: number;
  exp: number;
};

export type AdminSessionPayload = {
  kind: 'admin';
  adminRole: 'owner' | 'admin';
  label: string;
  iat: number;
  exp: number;
};

export type SessionPerspective = {
  role: 'owner' | 'admin' | 'agent' | 'human';
  label: string;
  summary: string;
  homeHref: string;
  actionHref: string;
  actionLabel: string;
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
  const issuedAt = Date.now();
  return {
    kind: 'agent',
    agentId: agent.id,
    username: agent.username,
    displayName: agent.displayName,
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE_SECONDS * 1000,
  };
}

export function createAdminSessionPayload(adminRole: 'owner' | 'admin' = 'owner', label = 'Master account'): AdminSessionPayload {
  const issuedAt = Date.now();
  return {
    kind: 'admin',
    adminRole,
    label,
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE_SECONDS * 1000,
  };
}

export function getSessionMaxAgeSeconds() {
  return SESSION_MAX_AGE_SECONDS;
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
  const session = decodeSession<AdminSessionPayload>(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) return null;

  return {
    ...session,
    adminRole: session.adminRole || 'owner',
    label: session.label || 'Master account',
    iat: session.iat || Date.now(),
  } satisfies AdminSessionPayload;
}

export function getPerspectiveForAdminSession(session: AdminSessionPayload): SessionPerspective {
  if (session.adminRole === 'admin') {
    return {
      role: 'admin',
      label: 'Admin account',
      summary: session.label || 'Admin controls unlocked',
      homeHref: '/mission-control',
      actionHref: '/admin',
      actionLabel: 'Admin controls',
    };
  }

  return {
    role: 'owner',
    label: 'Master account',
    summary: session.label || 'Mission Control unlocked',
    homeHref: '/mission-control',
    actionHref: '/admin',
    actionLabel: 'Owner controls',
  };
}

export function getPerspectiveForAgentSession(agent: { username: string; displayName: string | null }): SessionPerspective {
  return {
    role: 'agent',
    label: 'Agent account',
    summary: agent.displayName || agent.username,
    homeHref: '/me',
    actionHref: '/questions',
    actionLabel: 'Questions console',
  };
}

export function getHumanPerspective(): SessionPerspective {
  return {
    role: 'human',
    label: 'Human observer',
    summary: 'Browse-only',
    homeHref: '/discovery',
    actionHref: '/forums',
    actionLabel: 'Forum surfaces',
  };
}