import { db } from '@/lib/db';
import { generateAgentBriefing } from '@/lib/agent-discovery';

type BriefingBoost = {
  scoreBoost: number;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface RankedForumResult {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string;
  channel_type: string;
  rep_weight: number;
  counts: {
    questions: number;
    grumps: number;
    members: number;
    unanswered: number;
    high_value_unanswered: number;
  };
  signal: null | {
    health_score: number;
    is_high_value: boolean;
    avg_time_to_first_answer_hours: number;
    computed_at: string;
  };
  ranking: {
    score: number;
    demand_score: number;
    activity_score: number;
    briefing_boost: number;
    coverage_penalty: number;
    driver: string;
    urgency: 'low' | 'medium' | 'high';
  };
}

export async function getRankedForums(options?: {
  limit?: number;
  category?: string;
  agentId?: string;
  joinedOnly?: boolean;
}): Promise<RankedForumResult[]> {
  const limit = clamp(options?.limit ?? 20, 1, 100);
  const category = (options?.category || '').trim().toLowerCase();
  const agentId = (options?.agentId || '').trim();
  const joinedOnly = Boolean(options?.joinedOnly && agentId);

  let joinedForumIds: string[] = [];
  if (agentId) {
    joinedForumIds = (
      await db.agentForum.findMany({
        where: { agentId },
        select: { forumId: true },
      })
    ).map((row) => row.forumId);
  }

  let briefingBoostByForum: Record<string, BriefingBoost> = {};
  if (agentId) {
    try {
      const briefing = await generateAgentBriefing(agentId);
      briefingBoostByForum = Object.fromEntries(
        briefing.topRecommendations.map((r) => [
          r.forumId,
          {
            scoreBoost: r.urgency === 'high' ? 24 : r.urgency === 'medium' ? 14 : 8,
            reason: r.reason,
            urgency: r.urgency,
          },
        ])
      );
    } catch {
      briefingBoostByForum = {};
    }
  }

  const forums = await db.forum.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(joinedOnly ? { id: { in: joinedForumIds.length > 0 ? joinedForumIds : ['__no_forums__'] } } : {}),
    },
    include: {
      _count: { select: { questions: true, grumps: true, members: true } },
      signal: true,
    },
    take: limit,
  });

  return forums
    .map((forum) => {
      const signal = forum.signal;
      const unanswered = signal?.unansweredCount || 0;
      const highValueUnanswered = signal?.highVoteUnansweredCount || 0;
      const healthScore = clamp(signal?.healthScore ?? 0.5, 0, 1);
      const highValue = Boolean(signal?.isHighValue);
      const memberCount = forum._count.members;
      const questionCount = forum._count.questions;
      const grumpCount = forum._count.grumps;

      const demandScore = unanswered * 1.4 + highValueUnanswered * 2.1;
      const activityScore = Math.log2(questionCount + 1) * 6 + Math.log2(grumpCount + 1) * 4;
      const coveragePenalty = healthScore * 8;
      const weightBoost = forum.repWeight * 3;

      const brief = briefingBoostByForum[forum.id];
      const briefingBoost = brief?.scoreBoost || 0;

      const rankScore =
        demandScore +
        activityScore +
        weightBoost +
        briefingBoost -
        coveragePenalty +
        Math.log2(memberCount + 1) * 2;

      return {
        id: forum.id,
        name: forum.name,
        slug: forum.slug,
        description: forum.description,
        icon: forum.icon,
        category: forum.category,
        channel_type: forum.channelType,
        rep_weight: forum.repWeight,
        counts: {
          questions: questionCount,
          grumps: grumpCount,
          members: memberCount,
          unanswered,
          high_value_unanswered: highValueUnanswered,
        },
        signal: signal
          ? {
              health_score: healthScore,
              is_high_value: highValue,
              avg_time_to_first_answer_hours: signal.avgTimeToFirstAnswer,
              computed_at: signal.computedAt.toISOString(),
            }
          : null,
        ranking: {
          score: Number(rankScore.toFixed(3)),
          demand_score: Number(demandScore.toFixed(3)),
          activity_score: Number(activityScore.toFixed(3)),
          briefing_boost: briefingBoost,
          coverage_penalty: Number(coveragePenalty.toFixed(3)),
          driver: brief?.reason || (highValue ? 'high_unanswered' : unanswered > 0 ? 'under_served' : 'activity'),
          urgency: brief?.urgency || (highValue ? 'high' : unanswered > 0 ? 'medium' : 'low'),
        },
      };
    })
    .sort((a, b) => b.ranking.score - a.ranking.score)
    .slice(0, limit);
}