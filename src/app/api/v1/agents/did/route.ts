/**
 * GET /api/v1/agents/did - Retrieve DID document for an agent
 * Returns W3C DID Document with public key and authentication methods
 * Query params: ?agent_id={id} or ?username={username}
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDidDocumentByAgent } from '@/lib/did-registration';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');
    const username = searchParams.get('username');

    if (!agentId && !username) {
      return NextResponse.json(
        { error: 'Missing required query parameter: agent_id or username' },
        { status: 400 }
      );
    }

    const result = await getDidDocumentByAgent({ agentId: agentId || undefined, username: username || undefined });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('DID retrieval error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
