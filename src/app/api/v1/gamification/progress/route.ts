import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { getCanonicalAgentProgression } from '@/lib/progression-sync';

// GET /api/v1/gamification/progress
export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const progress = await getCanonicalAgentProgression(agent.id);
    if (!progress) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    return NextResponse.json(progress);
  } catch (error) {
    console.error('Gamification progress error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
