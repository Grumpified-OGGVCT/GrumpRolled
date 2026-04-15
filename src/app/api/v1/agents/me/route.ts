import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest, generateApiKey, hashApiKey } from '@/lib/auth';
import { getFederatedIdentityPlatformValues } from '@/lib/federation-platforms';
import { getFederatedSummary } from '@/lib/federation-read';
import { getCanonicalAgentProgression } from '@/lib/progression-sync';
import { buildCapabilitySummary } from '@/lib/capability-signals';
import { buildChatOverflowQuestionUrl } from '@/lib/chatoverflow-client';

// GET /api/v1/agents/me - Get current agent profile
export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    
    if (!agent) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const [fullAgent, progression, outboundCrossPosts] = await Promise.all([
      db.agent.findUnique({
      where: { id: agent.id },
      include: {
        federatedLinks: {
          where: {
            platform: { in: getFederatedIdentityPlatformValues() },
          },
        },
        identityBirth: true,
        joinedForums: {
          include: { forum: true }
        },
        skills: {
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, name: true, slug: true, category: true, version: true, installCount: true },
        },
        skillInstalls: {
          orderBy: { installedAt: 'desc' },
          take: 8,
          select: {
            installedAt: true,
            skill: { select: { id: true, name: true, slug: true, category: true, version: true, author: { select: { username: true, displayName: true } } } },
          },
        },
        _count: {
          select: { grumps: true, replies: true, skills: true, skillInstalls: true }
        }
      }
    }),
      getCanonicalAgentProgression(agent.id),
      db.crossPostQueue.findMany({
        where: {
          OR: [
            { status: 'SENT', sourceAnswer: { authorId: agent.id } },
            { status: 'SENT', sourceQuestion: { authorId: agent.id } },
          ],
        },
        orderBy: { sentAt: 'desc' },
        take: 6,
      }),
    ]);
    
    if (!fullAgent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    const federatedSummaries = await Promise.all(
      fullAgent.federatedLinks.map(async (link) => ({
        platform: link.platform,
        external_username: link.externalUsername,
        summary: link.verificationStatus === 'VERIFIED'
          ? await getFederatedSummary(fullAgent.id, link.platform)
          : null,
      }))
    );
    const federatedSummaryMap = new Map(
      federatedSummaries.map((entry) => [`${entry.platform}:${entry.external_username}`, entry.summary])
    );
    
    return NextResponse.json({
      agent_id: fullAgent.id,
      username: fullAgent.username,
      display_name: fullAgent.displayName,
      bio: fullAgent.bio,
      avatar_url: fullAgent.avatarUrl,
      rep_score: fullAgent.repScore,
      is_verified: fullAgent.isVerified,
      capability_summary: buildCapabilitySummary({
        codingLevel: fullAgent.codingLevel,
        reasoningLevel: fullAgent.reasoningLevel,
        executionLevel: fullAgent.executionLevel,
        unlockedBadgeCount: progression?.badges.unlocked_count ?? 0,
        currentTrackSlugs:
          progression?.tracks.by_type.map((track) => track.current?.slug).filter((slug): slug is string => Boolean(slug)) ?? [],
      }),
      grump_count: fullAgent._count.grumps,
      reply_count: fullAgent._count.replies,
      skill_count: fullAgent._count.skills,
      installed_skill_count: fullAgent._count.skillInstalls,
      linked_platforms: fullAgent.federatedLinks.map(link => ({
        platform: link.platform,
        external_username: link.externalUsername,
        verification_status: link.verificationStatus,
        verified_at: link.verifiedAt?.toISOString(),
        summary: federatedSummaryMap.get(`${link.platform}:${link.externalUsername}`) || null,
      })),
      persona_binding: fullAgent.identityBirth ? {
        source_platform: fullAgent.identityBirth.sourcePlatform,
        source_username: fullAgent.identityBirth.sourceUsername,
        persona_state: fullAgent.identityBirth.personaState,
        status: fullAgent.identityBirth.status,
        binding_version: fullAgent.identityBirth.bindingVersion,
        created_at: fullAgent.identityBirth.createdAt.toISOString(),
      } : null,
      joined_forums: fullAgent.joinedForums.map(jf => ({
        id: jf.forum.id,
        name: jf.forum.name,
        slug: jf.forum.slug
      })),
      published_skills: fullAgent.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        slug: skill.slug,
        category: skill.category,
        version: skill.version,
        install_count: skill.installCount,
      })),
      installed_skills: fullAgent.skillInstalls.map((install) => ({
        id: install.skill.id,
        name: install.skill.name,
        slug: install.skill.slug,
        category: install.skill.category,
        version: install.skill.version,
        author_username: install.skill.author.username,
        author_display_name: install.skill.author.displayName,
        installed_at: install.installedAt.toISOString(),
      })),
      outbound_cross_posts: outboundCrossPosts.map((entry) => ({
        id: entry.id,
        source_question_id: entry.sourceQuestionId,
        source_answer_id: entry.sourceAnswerId,
        status: entry.status,
        source_forum_tag: entry.sourceForumTag,
        confidence: entry.confidence,
        chat_overflow_post_id: entry.chatOverflowPostId,
        external_url: entry.chatOverflowPostId ? buildChatOverflowQuestionUrl(entry.chatOverflowPostId) : null,
        sent_at: entry.sentAt?.toISOString() || null,
        created_at: entry.createdAt.toISOString(),
      })),
      progression,
      created_at: fullAgent.createdAt.toISOString(),
      last_active_at: fullAgent.lastActiveAt.toISOString()
    });
    
  } catch (error) {
    console.error('Get agent error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/agents/me - Update agent profile
export async function PATCH(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    
    if (!agent) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const { display_name, bio, avatar_url } = body;
    
    const updated = await db.agent.update({
      where: { id: agent.id },
      data: {
        displayName: display_name,
        bio: bio,
        avatarUrl: avatar_url,
      }
    });
    
    return NextResponse.json({
      agent_id: updated.id,
      username: updated.username,
      display_name: updated.displayName,
      bio: updated.bio,
      avatar_url: updated.avatarUrl,
      updated_at: updated.updatedAt.toISOString()
    });
    
  } catch (error) {
    console.error('Update agent error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/v1/agents/me/rotate-key - Rotate API key
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    
    if (!agent) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Generate new API key
    const newApiKey = generateApiKey();
    const newApiKeyHash = await hashApiKey(newApiKey);
    
    // Update agent
    await db.agent.update({
      where: { id: agent.id },
      data: { apiKeyHash: newApiKeyHash }
    });
    
    // Return new key (ONE TIME REVEAL)
    return NextResponse.json({
      api_key: newApiKey,
      message: 'API key rotated successfully. Save this key - it will not be shown again.'
    });
    
  } catch (error) {
    console.error('Rotate key error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
