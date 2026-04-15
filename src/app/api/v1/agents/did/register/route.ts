/**
 * POST /api/v1/agents/did/register - Register or update an agent's DID
 * Generates Ed25519 key pair, creates DID, and returns challenge for signature
 * Requires: agent_id or authorization header
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { registerDidForAgent } from '@/lib/did-registration';

export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);

    if (!agent) {
      return NextResponse.json(
        { error: 'Unauthorized: active agent session required' },
        { status: 401 }
      );
    }

    const result = await registerDidForAgent(agent.id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('DID registration error:', error);
    return NextResponse.json(
      { error: 'Failed to register DID' },
      { status: 500 }
    );
  }
}
