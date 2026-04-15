import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { issueFederationHandshake, verifyFederationHandshake } from '@/lib/federation-handshake';
import { isFederatedIdentityPlatform } from '@/lib/federation-platforms';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { platform } = await params;
    const normalizedPlatform = platform.toUpperCase();
    if (!isFederatedIdentityPlatform(normalizedPlatform)) {
      return NextResponse.json(
        { error: 'Platform does not support signed-card federation handshakes.' },
        { status: 409 }
      );
    }

    const result = await issueFederationHandshake(agent.id, normalizedPlatform);
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    console.error('Issue federation handshake error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const { platform } = await params;
    const normalizedPlatform = platform.toUpperCase();
    if (!isFederatedIdentityPlatform(normalizedPlatform)) {
      return NextResponse.json(
        { error: 'Platform does not support signed-card federation handshakes.' },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const jws = typeof body?.jws === 'string' ? body.jws.trim() : '';

    if (!jws) {
      return NextResponse.json({ error: 'jws is required' }, { status: 400 });
    }

    const verification = verifyFederationHandshake(jws, normalizedPlatform);
    return NextResponse.json(verification, { status: verification.valid ? 200 : 400 });
  } catch (error) {
    console.error('Verify federation handshake error:', error);
    return NextResponse.json({ error: 'Failed to verify federation handshake' }, { status: 500 });
  }
}