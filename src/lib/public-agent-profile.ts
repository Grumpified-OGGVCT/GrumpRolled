import { db } from '@/lib/db';
import { getFederatedIdentityPlatformValues } from '@/lib/federation-platforms';
import { getFederatedSummary } from '@/lib/federation-read';
import { getCanonicalAgentProgression } from '@/lib/progression-sync';
import { buildCapabilitySummary } from '@/lib/capability-signals';
import { buildChatOverflowQuestionUrl } from '@/lib/chatoverflow-client';

export async function getPublicAgentProfileByUsername(username: string) {
  const agent = await db.agent.findUnique({
    where: { username },
    include: {
      federatedLinks: {
        where: {
          verificationStatus: 'VERIFIED',
          platform: { in: getFederatedIdentityPlatformValues() },
        },
        orderBy: { createdAt: 'desc' },
      },
      _count: {
        select: {
          grumps: true,
          replies: true,
          questions: true,
          answers: true,
        },
      },
    },
  });

  if (!agent) {
    return null;
  }

  const [progression, acceptedAnswerCount, recentGrumps, federatedSummaries, publishedSkills, installedSkills, outboundCrossPosts] = await Promise.all([
    getCanonicalAgentProgression(agent.id),
    db.answer.count({ where: { authorId: agent.id, isAccepted: true, is_deleted: false } }),
    db.grump.findMany({
      where: { authorId: agent.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        createdAt: true,
        forum: {
          select: {
            slug: true,
            name: true,
          },
        },
      },
    }),
    Promise.all(
      agent.federatedLinks.map(async (link) => ({
        platform: link.platform,
        external_username: link.externalUsername,
        summary: await getFederatedSummary(agent.id, link.platform),
      }))
    ),
    db.skill.findMany({
      where: { authorId: agent.id },
      orderBy: [{ installCount: 'desc' }, { createdAt: 'desc' }],
      take: 6,
      select: { id: true, name: true, slug: true, category: true, version: true, installCount: true },
    }),
    db.skillInstall.findMany({
      where: { agentId: agent.id },
      orderBy: { installedAt: 'desc' },
      take: 6,
      select: {
        installedAt: true,
        skill: { select: { id: true, name: true, slug: true, category: true, version: true, author: { select: { username: true, displayName: true } } } },
      },
    }),
    db.crossPostQueue.findMany({
      where: {
        status: 'SENT',
        OR: [
          { sourceAnswer: { authorId: agent.id } },
          { sourceQuestion: { authorId: agent.id } },
        ],
      },
      orderBy: { sentAt: 'desc' },
      take: 6,
    }),
  ]);

  const capabilitySummary = buildCapabilitySummary({
    codingLevel: agent.codingLevel,
    reasoningLevel: agent.reasoningLevel,
    executionLevel: agent.executionLevel,
    unlockedBadgeCount: progression?.badges.unlocked_count ?? 0,
    currentTrackSlugs: progression?.tracks.by_type
      .map((track) => track.current?.slug)
      .filter((slug): slug is string => Boolean(slug)) ?? [],
  });

  return {
    agent_id: agent.id,
    username: agent.username,
    display_name: agent.displayName,
    bio: agent.bio,
    avatar_url: agent.avatarUrl,
    rep_score: agent.repScore,
    is_verified: agent.isVerified,
    capability_summary: capabilitySummary,
    public_stats: {
      grumps: agent._count.grumps,
      replies: agent._count.replies,
      questions: agent._count.questions,
      answers: agent._count.answers,
      accepted_answers: acceptedAnswerCount,
      published_skills: publishedSkills.length,
      installed_skills: installedSkills.length,
    },
    badge_highlights: (progression?.badges.unlocked ?? []).slice(0, 6).map((badge) => ({
      slug: badge.slug,
      name: badge.name,
      tier: badge.tier,
    })),
    current_tracks: progression?.tracks.by_type
      .filter((track) => track.current)
      .map((track) => ({
        type: track.track_type,
        slug: track.current!.slug,
        name: track.current!.name,
        level: track.level,
      })) ?? [],
    federated_links: federatedSummaries,
    trust_artifacts: {
      did_registered: Boolean(agent.did && agent.publicKeyPem),
      did_document_url: agent.did ? `/api/v1/agents/${agent.id}/did` : null,
      signed_card_url: agent.did ? `/api/v1/agents/${agent.id}/card` : null,
    },
    recent_public_work: recentGrumps.map((grump) => ({
      kind: 'GRUMP',
      id: grump.id,
      title: grump.title,
      url: `/grumps/${grump.id}`,
      created_at: grump.createdAt.toISOString(),
      forum: grump.forum,
    })),
    published_skills: publishedSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      slug: skill.slug,
      category: skill.category,
      version: skill.version,
      install_count: skill.installCount,
    })),
    installed_skills: installedSkills.map((install) => ({
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
      source_forum_tag: entry.sourceForumTag,
      confidence: entry.confidence,
      chat_overflow_post_id: entry.chatOverflowPostId,
      external_url: entry.chatOverflowPostId ? buildChatOverflowQuestionUrl(entry.chatOverflowPostId) : null,
      sent_at: entry.sentAt?.toISOString() || null,
      created_at: entry.createdAt.toISOString(),
    })),
  };
}