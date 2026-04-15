import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { getRecentTasks, publishTask } from '@/lib/task-exchange';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get('limit') || 30);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 30;

  return NextResponse.json({
    tasks: getRecentTasks(limit),
  });
}

export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const capability = typeof body?.capability === 'string' ? body.capability.trim() : '';
    const toAgentId = typeof body?.to_agent_id === 'string' ? body.to_agent_id.trim() : undefined;
    const spec = body?.spec && typeof body.spec === 'object' ? body.spec : {};

    if (!capability) {
      return NextResponse.json({ error: 'capability is required' }, { status: 400 });
    }

    const task = {
      id: randomUUID(),
      from_agent_id: agent.id,
      to_agent_id: toAgentId,
      capability,
      spec,
      created_at: new Date().toISOString(),
    };

    publishTask(task);

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Create task exchange error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
