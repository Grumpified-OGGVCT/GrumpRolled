import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest, generateChallengeCode } from '@/lib/auth';
import { getFederatedSummary } from '@/lib/federation-read';
import { getFederatedIdentityPlatformValues, isFederatedIdentityPlatform } from '@/lib/federation-platforms';
import { validateFederatedProfileUrl } from '@/lib/security/url-policy';

const ALLOWED_PLATFORMS: Set<string> = new Set(getFederatedIdentityPlatformValues());
const EXTERNAL_USERNAME_REGEX = /^[a-zA-Z0-9._-]{2,64}$/;

// GET /api/v1/federation/links
export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const links = await db.federatedLink.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: 'desc' },
    });

    const summaries = await Promise.all(
      links.map(async (link) => ({
        id: link.id,
        summary: link.verificationStatus === 'VERIFIED'
          && isFederatedIdentityPlatform(link.platform)
          ? await getFederatedSummary(agent.id, link.platform)
          : null,
      }))
    );
    const summaryMap = new Map(summaries.map((entry) => [entry.id, entry.summary]));

    return NextResponse.json({
      links: links.map((l) => ({
        id: l.id,
        platform: l.platform,
        external_username: l.externalUsername,
        external_profile_url: l.externalProfileUrl,
        verification_status: l.verificationStatus,
        challenge_code: l.verificationStatus === 'PENDING' ? l.verificationCode : null,
        verified_at: l.verifiedAt?.toISOString() || null,
        handshake_url:
          l.verificationStatus === 'VERIFIED'
            ? `/api/v1/federation/links/${l.platform.toLowerCase()}/handshake`
            : null,
        summary: summaryMap.get(l.id) || null,
      })),
    });
  } catch (error) {
    console.error('Get federation links error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/federation/links
// Idempotent create/update for robustness.
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const platform = String(body.platform || '').toUpperCase();
    const externalUsername = String(body.external_username || '').trim();
    const externalProfileUrl = body.external_profile_url ? String(body.external_profile_url).trim() : null;

    if (!ALLOWED_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: 'Invalid platform.' }, { status: 400 });
    }
    if (!externalUsername) {
      return NextResponse.json({ error: 'external_username is required.' }, { status: 400 });
    }
    if (!EXTERNAL_USERNAME_REGEX.test(externalUsername)) {
      return NextResponse.json({ error: 'external_username has invalid format.' }, { status: 400 });
    }

    const validatedProfileUrl = validateFederatedProfileUrl(platform, externalProfileUrl);
    if (!validatedProfileUrl.ok) {
      return NextResponse.json({ error: 'external_profile_url is invalid for this platform.' }, { status: 400 });
    }

    const challengeCode = generateChallengeCode();

    const existing = await db.federatedLink.findUnique({
      where: { agentId_platform: { agentId: agent.id, platform } },
    });

    const sameIdentity =
      existing &&
      existing.externalUsername === externalUsername &&
      (existing.externalProfileUrl || null) === (validatedProfileUrl.normalized || null);

    if (existing?.verificationStatus === 'VERIFIED' && sameIdentity) {
      return NextResponse.json({
        id: existing.id,
        platform: existing.platform,
        external_username: existing.externalUsername,
        verification_status: existing.verificationStatus,
        challenge_code: null,
        verified_at: existing.verifiedAt?.toISOString() || null,
        note: 'Already verified for this linked identity.',
      });
    }

    const link = await db.federatedLink.upsert({
      where: { agentId_platform: { agentId: agent.id, platform } },
      create: {
        agentId: agent.id,
        platform,
        externalUsername,
        externalProfileUrl: validatedProfileUrl.normalized,
        verificationStatus: 'PENDING',
        verificationCode: challengeCode,
      },
      update: {
        externalUsername,
        externalProfileUrl: validatedProfileUrl.normalized,
        verificationStatus: 'PENDING',
        verificationCode: challengeCode,
        verifiedAt: null,
      },
    });

    await db.adminActionLog.create({
      data: {
        action: existing ? 'FEDERATION_LINK_RESET' : 'FEDERATION_LINK_CREATE',
        targetType: 'FEDERATED_LINK',
        targetId: link.id,
        metadata: JSON.stringify({
          actor_type: 'SELF',
          actor_id: agent.id,
          actor_label: agent.username,
          platform: link.platform,
          external_username: link.externalUsername,
          verification_status: link.verificationStatus,
        }),
      },
    });

    return NextResponse.json({
      id: link.id,
      platform: link.platform,
      external_username: link.externalUsername,
      verification_status: link.verificationStatus,
      challenge_code: link.verificationCode,
      handshake_url: null,
    });
  } catch (error) {
    console.error('Create federation link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
