import { NextRequest, NextResponse } from 'next/server';

import { findAgentByApiKey } from '@/lib/auth';
import { clearAgentSession, createAgentSessionPayload, setAgentSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const apiKey = String(body.api_key || '').trim();

    if (!apiKey) {
      return NextResponse.json({ error: 'api_key is required' }, { status: 400 });
    }

    const agent = await findAgentByApiKey(apiKey);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = NextResponse.json({
      role: 'agent',
      agent: {
        agent_id: agent.id,
        username: agent.username,
        display_name: agent.displayName,
        rep_score: agent.repScore,
      },
    });
    setAgentSession(response, createAgentSessionPayload(agent));
    return response;
  } catch (error) {
    console.error('Agent session start error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ cleared: true });
  clearAgentSession(response);
  return response;
}