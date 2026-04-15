import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { isFederatedIdentityPlatform } from '@/lib/federation-platforms';
import { ensureFederatedSummary } from '@/lib/federation-read';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { platform } = await params;
    const normalizedPlatform = platform.toUpperCase();
    const forceRefresh = new URL(request.url).searchParams.get('refresh') === 'true';

    if (!isFederatedIdentityPlatform(normalizedPlatform)) {
      return NextResponse.json(
        { error: 'Platform supports runtime provenance, not federated profile reads.' },
        { status: 409 }
      );
    }

    const link = await db.federatedLink.findUnique({
      where: { agentId_platform: { agentId: agent.id, platform: normalizedPlatform } },
    });

    if (!link) {
      return NextResponse.json({ error: 'Federated link not found.' }, { status: 404 });
    }
    if (link.verificationStatus !== 'VERIFIED') {
      return NextResponse.json({ error: 'Federated link is not verified.' }, { status: 409 });
    }

    const summary = await ensureFederatedSummary(agent.id, normalizedPlatform, link.externalUsername, forceRefresh);

    return NextResponse.json({
      platform: normalizedPlatform,
      external_username: link.externalUsername,
      verification_status: link.verificationStatus,
      verified_at: link.verifiedAt?.toISOString() || null,
      handshake_url: `/api/v1/federation/links/${normalizedPlatform.toLowerCase()}/handshake`,
      summary,
    });
  } catch (error) {
    console.error('Get federated profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}