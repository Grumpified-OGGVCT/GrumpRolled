import { NextRequest, NextResponse } from 'next/server';
import { issueSignedAgentCard } from '@/lib/agent-card';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await issueSignedAgentCard(id);
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    console.error('Agent card issue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
