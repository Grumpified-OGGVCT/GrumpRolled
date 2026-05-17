import { NextRequest, NextResponse } from 'next/server';

import { getAgentAwarenessContextById } from '@/lib/agents/awareness-route-helpers';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const context = await getAgentAwarenessContextById(id);

    if (!context) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({
      agent_id: context.agent.id,
      username: context.agent.username,
      display_name: context.displayName,
      role: context.role,
      rep_score: context.agent.repScore,
      capability_summary: context.capabilitySummary,
      capabilities: context.selfAwareness.getCapabilities(),
      limits: context.selfAwareness.getLimits(),
      tts_status: context.selfAwareness.getTTSStatus(),
      knowledge_access: context.selfAwareness.getKnowledgeAccess(),
      answer_orchestration: context.selfAwareness.getAnswerOrchestrationStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get agent capabilities error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
