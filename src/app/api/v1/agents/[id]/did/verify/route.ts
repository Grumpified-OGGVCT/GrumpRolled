import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { verifyDidForAgent } from '@/lib/did-registration';

interface VerifyDidRequest {
  challenge_token?: string;
  challenge_signature?: string;
}

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
      return NextResponse.json({ error: 'Forbidden: agent may only verify its own DID' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as VerifyDidRequest;
    const challengeToken = String(body.challenge_token || '').trim();
    const challengeSignature = String(body.challenge_signature || '').trim();

    if (!challengeToken || !challengeSignature) {
      return NextResponse.json(
        { error: 'Missing required fields: challenge_token, challenge_signature' },
        { status: 400 }
      );
    }

    const result = await verifyDidForAgent(id, challengeToken, challengeSignature);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Agent DID verification error:', error);
    return NextResponse.json({ error: 'Failed to verify DID challenge' }, { status: 500 });
  }
}