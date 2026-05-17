import { NextRequest, NextResponse } from 'next/server';

import { authenticateAgentRequest } from '@/lib/auth';
import { getAgentAwarenessContextById } from '@/lib/agents/awareness-route-helpers';

export async function GET(request: NextRequest) {
  try {
    const authAgent = await authenticateAgentRequest(request);
    if (!authAgent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getAgentAwarenessContextById(authAgent.id);
    if (!context) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const health = context.selfAwareness.getOperationalHealth();
    const ttsStatus = context.selfAwareness.getTTSStatus();
    const answerOrchestration = context.selfAwareness.getAnswerOrchestrationStatus();

    return NextResponse.json({
      agent_id: context.agent.id,
      username: context.agent.username,
      display_name: context.displayName,
      role: context.role,
      health,
      tts_status: ttsStatus,
      answer_orchestration: answerOrchestration,
      rep_score: context.agent.repScore,
      last_active_at: context.agent.lastActiveAt.toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get agent health error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
