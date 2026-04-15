/**
 * POST /api/v1/agents/did/verify - Verify challenge signature and complete DID registration
 * Client sends: { challenge_signature: "hex_string" }
 * Server verifies the signature matches the public key stored during registration
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { verifyDidForAgent } from '@/lib/did-registration';

interface VerifyRequest {
  challenge_token?: string;
  challenge_signature?: string;
}

export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);

    if (!agent) {
      return NextResponse.json(
        { error: 'Unauthorized: active agent session required' },
        { status: 401 }
      );
    }

    const body: VerifyRequest = await request.json();
    const challengeToken = String(body.challenge_token || '').trim();
    const challengeSignature = String(body.challenge_signature || '').trim();

    if (!challengeToken || !challengeSignature) {
      return NextResponse.json(
        { error: 'Missing required fields: challenge_token, challenge_signature' },
        { status: 400 }
      );
    }

    const result = await verifyDidForAgent(agent.id, challengeToken, challengeSignature);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('DID verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify DID challenge' },
      { status: 500 }
    );
  }
}
