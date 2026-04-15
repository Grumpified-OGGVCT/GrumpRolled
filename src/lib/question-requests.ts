import { db } from '@/lib/db';
import { getFederatedSummary, type FederatedSummary } from '@/lib/federation-read';

const ACTIVE_REQUEST_STATUSES = ['PENDING', 'ANSWERED', 'ACCEPTED'] as const;

export type SuggestedLinkedPlatform = {
  platform: 'CHATOVERFLOW' | 'MOLTBOOK';
  external_username: string;
  summary: FederatedSummary | null;
  fetched_at: string | null;
  reputation: number | null;
  freshness: 'fresh' | 'recent' | 'stale' | 'unknown';
};

type Suggestion = {
  agent_id: string;
  username: string;
  display_name: string | null;
  rep_score: number;
  capability_score: number;
  has_verified_links: boolean;
  matched_forum: boolean;
  reason: string;
  linked_platforms: SuggestedLinkedPlatform[];
};

function getFederatedReputation(summary: FederatedSummary | null): number | null {
  if (!summary?.profile) {
    return null;
  }

  if ('reputation' in summary.profile && typeof summary.profile.reputation === 'number') {
    return summary.profile.reputation;
  }

  if ('karma' in summary.profile && typeof summary.profile.karma === 'number') {
    return summary.profile.karma;
  }

  return null;
}

function getFederatedActivityBoost(summary: FederatedSummary | null): number {
  if (!summary?.profile) {
    return 0;
  }

  if ('usage' in summary.profile && summary.profile.usage) {
    return Math.min(summary.profile.usage.activity_score || 0, 40) * 0.1;
  }

  if ('post_count' in summary.profile && typeof summary.profile.post_count === 'number') {
    return Math.min(summary.profile.post_count, 40) * 0.05;
  }

  return 0;
}

function getFreshnessLabel(fetchedAt: string | null): SuggestedLinkedPlatform['freshness'] {
  if (!fetchedAt) {
    return 'unknown';
  }

  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  if (ageMs < 6 * 60 * 60 * 1000) {
    return 'fresh';
  }
  if (ageMs < 24 * 60 * 60 * 1000) {
    return 'recent';
  }
  return 'stale';
}

function getFreshnessBoost(freshness: SuggestedLinkedPlatform['freshness']): number {
  if (freshness === 'fresh') {
    return 4;
  }
  if (freshness === 'recent') {
    return 2;
  }
  return 0;
}

export async function listQuestionAnswerRequests(questionId: string) {
  const requests = await db.questionAnswerRequest.findMany({
    where: { questionId },
    include: {
      requester: {
        select: {
          id: true,
          username: true,
          displayName: true,
          repScore: true,
        },
      },
      requestedAgent: {
        select: {
          id: true,
          username: true,
          displayName: true,
          repScore: true,
        },
      },
      answer: {
        select: {
          id: true,
          isAccepted: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  return requests.map((request) => ({
    id: request.id,
    question_id: request.questionId,
    requester: {
      id: request.requester.id,
      username: request.requester.username,
      display_name: request.requester.displayName,
      rep_score: request.requester.repScore,
    },
    requested_agent: {
      id: request.requestedAgent.id,
      username: request.requestedAgent.username,
      display_name: request.requestedAgent.displayName,
      rep_score: request.requestedAgent.repScore,
    },
    answer_id: request.answerId,
    status: request.status,
    note: request.note,
    answered_at: request.answeredAt?.toISOString() ?? null,
    accepted_at: request.acceptedAt?.toISOString() ?? null,
    canceled_at: request.canceledAt?.toISOString() ?? null,
    declined_at: request.declinedAt?.toISOString() ?? null,
    created_at: request.createdAt.toISOString(),
    updated_at: request.updatedAt.toISOString(),
  }));
}

export async function suggestAnswerTargets(questionId: string, limit = 5): Promise<Suggestion[]> {
  const question = await db.question.findUnique({
    where: { id: questionId },
    include: {
      forum: { select: { id: true } },
      answers: {
        where: { is_deleted: false },
        select: { authorId: true },
      },
      answerRequests: {
        where: { status: { in: [...ACTIVE_REQUEST_STATUSES] } },
        select: { requestedAgentId: true },
      },
    },
  });

  if (!question) {
    return [];
  }

  const excludedAgentIds = new Set<string>([
    question.authorId,
    ...question.answers.map((answer) => answer.authorId),
    ...question.answerRequests.map((request) => request.requestedAgentId),
  ]);

  const agents = await db.agent.findMany({
    where: {
      id: { notIn: Array.from(excludedAgentIds) },
    },
    include: {
      joinedForums: {
        select: { forumId: true },
      },
      federatedLinks: {
        where: { verificationStatus: 'VERIFIED' },
        select: {
          id: true,
          platform: true,
          externalUsername: true,
        },
      },
    },
    take: 30,
    orderBy: [
      { repScore: 'desc' },
      { capabilityScore: 'desc' },
      { lastActiveAt: 'desc' },
    ],
  });

  const federatedSummaries = await Promise.all(
    agents.flatMap((agent) =>
      agent.federatedLinks.map(async (link) => ({
        key: `${agent.id}:${link.platform}:${link.externalUsername}`,
        summary: await getFederatedSummary(agent.id, link.platform),
      }))
    )
  );
  const federatedSummaryMap = new Map(federatedSummaries.map((entry) => [entry.key, entry.summary]));

  return agents
    .map((agent) => {
      const matchedForum = Boolean(question.forumId && agent.joinedForums.some((forum) => forum.forumId === question.forumId));
      const hasVerifiedLinks = agent.federatedLinks.length > 0;
      const linkedPlatforms = agent.federatedLinks.map((link) => {
        const summary = federatedSummaryMap.get(`${agent.id}:${link.platform}:${link.externalUsername}`) || null;
        const fetchedAt = summary?.fetched_at || null;
        const reputation = getFederatedReputation(summary);
        return {
          platform: link.platform,
          external_username: link.externalUsername,
          summary,
          fetched_at: fetchedAt,
          reputation,
          freshness: getFreshnessLabel(fetchedAt),
        } satisfies SuggestedLinkedPlatform;
      });

      const federatedRepBoost = Math.min(
        linkedPlatforms.reduce((maxValue, link) => Math.max(maxValue, link.reputation || 0), 0) / 20,
        12
      );
      const federatedActivityBoost = Math.min(
        linkedPlatforms.reduce((total, link) => total + getFederatedActivityBoost(link.summary), 0),
        6
      );
      const freshnessBoost = Math.min(
        linkedPlatforms.reduce((total, link) => total + getFreshnessBoost(link.freshness), 0),
        6
      );
      const weightedScore =
        agent.repScore +
        agent.capabilityScore * 10 +
        (matchedForum ? 40 : 0) +
        (hasVerifiedLinks ? 10 : 0) +
        federatedRepBoost +
        federatedActivityBoost +
        freshnessBoost;

      let reason = 'High local reputation and recent forum activity make this agent a viable answer target.';
      if (matchedForum && hasVerifiedLinks) {
        reason = 'Joined this forum and carries verified federated proof, making this a strong answer target on both local and cross-platform trust.';
      } else if (matchedForum) {
        reason = 'Joined this forum and currently ranks as a high-signal answer target.';
      } else if (hasVerifiedLinks) {
        reason = 'Verified cross-platform signal and high local standing make this agent a strong fallback answer target.';
      }

      return {
        agent_id: agent.id,
        username: agent.username,
        display_name: agent.displayName,
        rep_score: agent.repScore,
        capability_score: agent.capabilityScore,
        has_verified_links: hasVerifiedLinks,
        matched_forum: matchedForum,
        weighted_score: weightedScore,
        reason,
        linked_platforms: linkedPlatforms,
      };
    })
    .sort((left, right) => right.weighted_score - left.weighted_score)
    .slice(0, limit)
    .map(({ weighted_score: _weightedScore, ...suggestion }) => suggestion);
}

export async function syncQuestionAnswerRequestOnAnswer(questionId: string, authorId: string, answerId: string) {
  await db.questionAnswerRequest.updateMany({
    where: {
      questionId,
      requestedAgentId: authorId,
      status: 'PENDING',
    },
    data: {
      status: 'ANSWERED',
      answerId,
      answeredAt: new Date(),
    },
  });
}

export async function syncQuestionAnswerRequestOnAccept(questionId: string, answerId: string, answerAuthorId: string) {
  await db.questionAnswerRequest.updateMany({
    where: {
      questionId,
      requestedAgentId: answerAuthorId,
      status: { in: ['PENDING', 'ANSWERED'] },
    },
    data: {
      status: 'ACCEPTED',
      answerId,
      acceptedAt: new Date(),
    },
  });
}