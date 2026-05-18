import { NextRequest, NextResponse } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { authenticateAgentRequest } from '@/lib/auth';
import {
  listCoordinationMessages,
  sanitizeCoordinationAgentList,
  submitCoordinationMessage,
  type CoordinationAction,
} from '@/lib/ops-coordination';

const VALID_ACTIONS = new Set<CoordinationAction>(['synthesize', 'share', 'coordinate', 'health-check']);

function parseLimit(value: string | null, fallback = 50): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

function sanitizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseAction(value: unknown): CoordinationAction | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim() as CoordinationAction;
  return VALID_ACTIONS.has(trimmed) ? trimmed : null;
}

// POST /api/v1/ops/coordination
export async function POST(request: NextRequest) {
  try {
    const admin = isAdminRequest(request);
    const authAgent = admin ? null : await authenticateAgentRequest(request);

    if (!admin && !authAgent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = parseAction(body?.action);

    if (!action) {
      return NextResponse.json(
        { error: 'action must be one of synthesize, share, coordinate, health-check' },
        { status: 400 },
      );
    }

    const fromAgent = authAgent?.username ?? sanitizeOptionalString(body?.fromAgent) ?? 'master-agent';
    const { message, duplicate } = await submitCoordinationMessage({
      fromAgent,
      toAgents: sanitizeCoordinationAgentList(body?.toAgents),
      action,
      payload: sanitizePayload(body?.payload),
      timestamp: sanitizeOptionalString(body?.timestamp),
      idempotencyKey: sanitizeOptionalString(body?.idempotencyKey),
    });

    return NextResponse.json(
      {
        duplicate,
        message,
      },
      { status: duplicate ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'fromAgent is required') {
      return NextResponse.json({ error: 'fromAgent is required' }, { status: 400 });
    }

    console.error('Create coordination message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/v1/ops/coordination
export async function GET(request: NextRequest) {
  try {
    const admin = isAdminRequest(request);
    const authAgent = admin ? null : await authenticateAgentRequest(request);

    if (!admin && !authAgent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const includeProcessed = searchParams.get('include_processed') === 'true';
    const agentFilter = admin ? sanitizeOptionalString(searchParams.get('agent')) : authAgent!.username;

    const messages = agentFilter
      ? await listCoordinationMessages({
          agent: agentFilter,
          includeProcessed,
          includeSentByAgent: true,
          limit,
        })
      : await listCoordinationMessages({ includeProcessed, limit });

    return NextResponse.json({
      viewer_scope: admin ? 'owner' : 'agent',
      agent_filter: agentFilter ?? null,
      include_processed: includeProcessed,
      count: messages.length,
      messages,
    });
  } catch (error) {
    console.error('List coordination messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
