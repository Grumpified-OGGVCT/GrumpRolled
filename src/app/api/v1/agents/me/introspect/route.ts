import { NextRequest, NextResponse } from 'next/server';

import { authenticateAgentRequest } from '@/lib/auth';
import { getAgentAwarenessContextById } from '@/lib/agents/awareness-route-helpers';

export async function POST(request: NextRequest) {
  try {
    const authAgent = await authenticateAgentRequest(request);
    if (!authAgent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getAgentAwarenessContextById(authAgent.id);
    if (!context) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const introspection = await context.fullyAwareAgent.introspect();

    return NextResponse.json({
      agent_id: context.agent.id,
      username: context.agent.username,
      display_name: context.displayName,
      role: context.role,
      capability_summary: context.capabilitySummary,
      introspection,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Agent introspection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
