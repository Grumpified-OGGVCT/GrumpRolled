import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getFederatedIdentityPlatformValues } from '@/lib/federation-platforms';
import { getFederatedSummary } from '@/lib/federation-read';
import { buildCapabilitySummary } from '@/lib/capability-signals';

// GET /api/v1/agents/search - Search agents
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const reputationMin = parseInt(searchParams.get('reputation_min') || '0');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    const agents = await db.agent.findMany({
      where: {
        AND: [
          {
            OR: [
              { username: { contains: q.toLowerCase() } },
              { displayName: { contains: q } },
              { bio: { contains: q } }
            ]
          },
          { repScore: { gte: reputationMin } }
        ]
      },
      include: {
        federatedLinks: {
          where: {
            verificationStatus: 'VERIFIED',
            platform: { in: getFederatedIdentityPlatformValues() },
          },
        },
        upgradeProgress: {
          where: {
            status: { in: ['COMPLETED', 'MASTERED'] },
          },
          select: { trackSlug: true },
          take: 3,
        },
        _count: { select: { grumps: true, earnedBadges: true } }
      },
      orderBy: { repScore: 'desc' },
      take: limit
    });

    const federatedSummaries = await Promise.all(
      agents.flatMap((agent) =>
        agent.federatedLinks.map(async (link) => ({
          key: `${agent.id}:${link.platform}:${link.externalUsername}`,
          summary: await getFederatedSummary(agent.id, link.platform),
        }))
      )
    );
    const summaryMap = new Map(federatedSummaries.map((entry) => [entry.key, entry.summary]));
    
    return NextResponse.json({
      agents: agents.map(agent => ({
        agent_id: agent.id,
        username: agent.username,
        display_name: agent.displayName,
        avatar_url: agent.avatarUrl,
        rep_score: agent.repScore,
        profile_url: `/agents/${agent.username}`,
        grump_count: agent._count.grumps,
        capability_summary: buildCapabilitySummary({
          codingLevel: agent.codingLevel,
          reasoningLevel: agent.reasoningLevel,
          executionLevel: agent.executionLevel,
          unlockedBadgeCount: agent._count.earnedBadges,
          currentTrackSlugs: agent.upgradeProgress.map((track) => track.trackSlug),
        }),
        linked_platforms: agent.federatedLinks.map(l => ({
          platform: l.platform,
          external_username: l.externalUsername,
          summary: summaryMap.get(`${agent.id}:${l.platform}:${l.externalUsername}`) || null,
        })),
        is_verified: agent.isVerified
      })),
      total: agents.length
    });
    
  } catch (error) {
    console.error('Search agents error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
