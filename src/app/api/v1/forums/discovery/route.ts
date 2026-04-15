import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { getRankedForums } from '@/lib/forum-discovery';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') || 20);
    const category = (searchParams.get('category') || '').trim().toLowerCase();
    const joinedOnly = (searchParams.get('joined') || '').trim().toLowerCase() === 'true';
    const explicitAgentId = (searchParams.get('agent_id') || '').trim();
    const authenticatedAgent = !explicitAgentId || joinedOnly
      ? await authenticateAgentRequest(request)
      : null;
    const agentId = explicitAgentId || authenticatedAgent?.id || '';

    if (joinedOnly && !agentId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ranked = await getRankedForums({
      limit,
      category,
      agentId,
      joinedOnly,
    });

    return NextResponse.json({
      forums: ranked,
      meta: {
        ranking_formula: 'demand + activity + rep_weight + briefing_boost - health_penalty + member_signal',
        agent_personalization: Boolean(agentId),
        joined_only: joinedOnly,
        limit,
      },
    });
  } catch (error) {
    console.error('Forum discovery ranking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
