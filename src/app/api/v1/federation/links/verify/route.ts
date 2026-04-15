import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { ensureFederatedSummary } from '@/lib/federation-read';
import { timingSafeEqual, createHash } from 'crypto';

const CHALLENGE_CODE_REGEX = /^grmp_verify_[a-f0-9]{32}$/;

function constantTimeEquals(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

// POST /api/v1/federation/links/verify
// Robust verification transition with explicit checks.
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const platform = String(body.platform || '').toUpperCase();
    const challengeCode = String(body.challenge_code || '').trim();

    if (!platform || !challengeCode) {
      return NextResponse.json({ error: 'platform and challenge_code are required.' }, { status: 400 });
    }
    if (!CHALLENGE_CODE_REGEX.test(challengeCode)) {
      return NextResponse.json({ error: 'Invalid challenge code format.' }, { status: 400 });
    }

    const link = await db.federatedLink.findUnique({
      where: { agentId_platform: { agentId: agent.id, platform } },
    });

    if (!link) {
      return NextResponse.json({ error: 'Federated link not found.' }, { status: 404 });
    }

    if (link.verificationStatus === 'VERIFIED') {
      return NextResponse.json({
        platform: link.platform,
        verification_status: 'VERIFIED',
        verified_at: link.verifiedAt?.toISOString() || null,
        note: 'Already verified.',
      });
    }

    if (link.verificationStatus !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot verify a link in ${link.verificationStatus} state.` },
        { status: 409 }
      );
    }

    if (!link.verificationCode || !constantTimeEquals(link.verificationCode, challengeCode)) {
      return NextResponse.json({ error: 'Invalid challenge code.' }, { status: 400 });
    }

    const updated = await db.federatedLink.update({
      where: { id: link.id },
      data: {
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        verificationCode: null,
      },
    });

    await db.adminActionLog.create({
      data: {
        action: 'FEDERATION_LINK_VERIFY',
        targetType: 'FEDERATED_LINK',
        targetId: updated.id,
        metadata: JSON.stringify({
          actor_type: 'SELF',
          actor_id: agent.id,
          actor_label: agent.username,
          platform: updated.platform,
          external_username: updated.externalUsername,
          verification_status: updated.verificationStatus,
          verified_at: updated.verifiedAt?.toISOString() || null,
        }),
      },
    });

    const summary = await ensureFederatedSummary(agent.id, updated.platform, updated.externalUsername, true).catch((error) => {
      console.error('Federated read sync after verification failed:', error);
      return null;
    });

    return NextResponse.json({
      platform: updated.platform,
      external_username: updated.externalUsername,
      verification_status: updated.verificationStatus,
      verified_at: updated.verifiedAt?.toISOString() || null,
      summary,
    });
  } catch (error) {
    console.error('Verify federation link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
