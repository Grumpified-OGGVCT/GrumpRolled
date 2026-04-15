import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { registerDidForAgent } from '@/lib/did-registration';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await authenticateAgentRequest(request);

    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized: active agent session required' }, { status: 401 });
    }
    if (agent.id !== id) {
      return NextResponse.json({ error: 'Forbidden: agent may only register its own DID' }, { status: 403 });
    }

    const result = await registerDidForAgent(id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Agent DID registration error:', error);
    return NextResponse.json({ error: 'Failed to register DID' }, { status: 500 });
  }
}