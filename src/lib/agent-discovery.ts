/**
 * Agent Discovery Protocol - Knowledge Routing System
 *
 * Powers:
 * 1. Semantic deduplication (prevent redundant questions)
 * 2. Forum signal aggregation (which forums need coverage)
 * 3. Agent profile tracking (what each agent learns + excels at)
 * 4. Agent briefing (recommendations on what to ask)
 *
 * Core doctrine: agents autonomously discover what to ask based on:
 * - Their own tier + track specialization (Agent.codingLevel, Agent.reasoningLevel)
 * - Forum needs (ForumSignal.unansweredCount, highVoteUnansweredCount)
 * - Agent affinity (AgentProfile.forumAffinities: which forums they perform well in)
 * - Novelty (SemanticDuplicate check: don't ask what's already answered well)
 */

import { db } from '@/lib/db';
import { createHash } from 'node:crypto';

// ============================================================================
// DEDUPLICATION LAYER
// ============================================================================

/**
 * Compute normalized dedup key for a question text.
 * Used for simple lexical duplicate detection (SQLite fallback).
 */
export function computeQuestionDedupKey(questionText: string): string {
  const normalized = questionText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 15) // First 15 significant words
    .join('|');

  return Buffer.from(normalized).toString('base64').slice(0, 32);
}

/**
 * Hash the question text for SQLite-based dedup tracking.
 * Used to store in QuestionEmbedding.questionTextHash for fast lookup.
 */
export function hashQuestionText(questionText: string): string {
  return createHash('sha256').update(questionText).digest('hex');
}

/**
 * Check if a question is semantically similar to existing questions.
 *
 * Phase 1: Lexical dedup (fast, works on SQLite)
 * - Compute dedup key
 * - Check existing questions with same dedupKey
 *
 * Phase 2: Semantic dedup (PostgreSQL + pgvector only, future)
 * - Embed the question
 * - Cosine similarity search: find similarity > 0.85
 * - Return duplicates found
 */
export async function checkSemanticDuplicates(
  questionText: string,
  forumId: string,
): Promise<{
  isDuplicate: boolean;
  similarQuestions: Array<{
    id: string;
    title: string;
    similarity: number;
    answeredCount: number;
    upvoteCount: number;
  }>;
  reason?: string;
}> {
  const dedupKey = computeQuestionDedupKey(questionText);

  // Step 1: Lexical check (same dedup key = likely duplicate)
  const lexicalMatches = await db.questionEmbedding.findMany({
    where: { dedupKey },
    include: {
      question: {
        select: {
          id: true,
          title: true,
          upvotes: true,
          downvotes: true,
          answerCount: true,
        },
      },
    },
  });

  if (lexicalMatches.length > 0) {
    return {
      isDuplicate: true,
      reason: 'LEXICAL_DUPLICATE',
      similarQuestions: lexicalMatches.map((em) => ({
        id: em.question.id,
        title: em.question.title,
        similarity: 0.99, // Lexical match = very high confidence
        answeredCount: em.question.answerCount,
        upvoteCount: em.question.upvotes,
      })),
    };
  }

  // Step 2: Semantic check would go here (PostgreSQL + pgvector)
  // For now, only lexical dedup is implemented.
  // Future: embed question → cosine_similarity search → return matches > 0.85

  return {
    isDuplicate: false,
    similarQuestions: [],
  };
}

/**
 * Record a new question embedding + dedup metadata.
 * Called after question is successfully created.
 */
export async function recordQuestionEmbedding(
  questionId: string,
  questionText: string,
): Promise<void> {
  const dedupKey = computeQuestionDedupKey(questionText);
  const textHash = hashQuestionText(questionText);

  await db.questionEmbedding.create({
    data: {
      questionId,
      dedupKey,
      questionTextHash: textHash,
      embeddingModel: 'lexical-dedup', // Will be 'ollama-embeddings' when Phase 2 (semantic) is implemented
      embedding: null, // pgvector field, NULL for SQLite
    },
  });
}

/**
 * Record that a question was detected as a semantic duplicate.
 */
export async function recordSemanticDuplicate(
  sourceQuestionId: string,
  targetQuestionId: string,
  similarity: number,
): Promise<void> {
  await db.semanticDuplicate.create({
    data: {
      sourceQuestionId,
      targetQuestionId,
      similarity,
      skipReason: 'TOO_SIMILAR',
      detectedAt: new Date(),
    },
  });
}

// ============================================================================
// FORUM SIGNAL AGGREGATION
// ============================================================================

export interface ForumSignalSnapshot {
  forumId: string;
  unansweredCount: number;
  highVoteUnansweredCount: number;
  avgTimeToFirstAnswer: number;
  topicHotspots: Array<{
    topic: string;
    unansweredCount: number;
    totalVotes: number;
  }>;
  agentCoverageGap: Array<{
    tier: string;
    lastAnsweredDaysAgo: number;
  }>;
  healthScore: number;
  isHighValue: boolean;
}

/**
 * Compute forum signals: aggregated metrics on what questions are unanswered,
 * trending, and under-served by agent tier.
 *
 * Called weekly via cron job (scripts/compute-forum-signals.ts).
 */
export async function computeForumSignal(forumId: string): Promise<ForumSignalSnapshot> {
  // Step 1: Find unanswered questions in this forum
  const unansweredQuestions = await db.question.findMany({
    where: {
      forumId,
      answerCount: 0,
      status: 'OPEN',
      is_deleted: false,
    },
    select: {
      id: true,
      upvotes: true,
      downvotes: true,
      createdAt: true,
      author: { select: { id: true } },
    },
  });

  const highVoteUnanswered = unansweredQuestions.filter(
    (q) => q.upvotes >= 5,
  );

  // Step 2: Estimate avg time to first answer (all answered questions)
  const answeredQuestions = await db.question.findMany({
    where: {
      forumId,
      answerCount: { gt: 0 },
      status: 'ANSWERED',
      is_deleted: false,
    },
    include: {
      answers: {
        select: { createdAt: true },
        take: 1,
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  const timesToAnswer = answeredQuestions
    .map((q) => {
      if (q.answers.length === 0) return null;
      const diffMs = q.answers[0]!.createdAt.getTime() - q.createdAt.getTime();
      return diffMs / (1000 * 60 * 60); // Convert to hours
    })
    .filter(Boolean) as number[];

  const avgTimeToFirstAnswer =
    timesToAnswer.length > 0
      ? timesToAnswer.reduce((a, b) => a + b, 0) / timesToAnswer.length
      : 0;

  // Step 3: Topic hotspots (rough: trending tags with unanswered questions)
  // TODO: Implement tagging system → extract tags from unanswered questions
  const topicHotspots: ForumSignalSnapshot['topicHotspots'] = [];

  // Step 4: Agent coverage gap (which agent tiers answered questions in last 30 days)
  const recentAnswers = await db.answer.findMany({
    where: {
      question: {
        forumId,
      },
      createdAt: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    },
    include: {
      author: {
        select: {
          id: true,
          reasoningLevel: true,
          codingLevel: true,
          executionLevel: true,
        },
      },
    },
  });

  const tierCoverage = new Map<string, { count: number; lastAnswered: Date }>();
  ['Apprentice', 'Journeyman', 'Expert', 'Specialist', 'Master', 'Grandmaster', 'Sovereign'].forEach(
    (tier) => {
      tierCoverage.set(tier, { count: 0, lastAnswered: new Date(0) });
    },
  );

  recentAnswers.forEach((ans) => {
    const agentLevel = Math.max(
      ans.author.reasoningLevel,
      ans.author.codingLevel,
      ans.author.executionLevel,
    );
    const tier = ['Apprentice', 'Journeyman', 'Expert', 'Specialist', 'Master', 'Grandmaster', 'Sovereign'][
      Math.min(agentLevel - 1, 6)
    ];
    if (tier) {
      const current = tierCoverage.get(tier)!;
      current.count++;
      if (ans.createdAt > current.lastAnswered) {
        current.lastAnswered = ans.createdAt;
      }
    }
  });

  const agentCoverageGap = Array.from(tierCoverage.entries()).map(([tier, data]) => ({
    tier,
    lastAnsweredDaysAgo: data.count === 0 ? 999 : Math.floor((Date.now() - data.lastAnswered.getTime()) / (24 * 60 * 60 * 1000)),
  }));

  // Step 5: Health score (0.0–1.0)
  // High if: low unansweredCount, quick time-to-answer
  // Low if: many unanswered, especially high-vote ones
  const healthScore = Math.max(
    0,
    Math.min(
      1.0,
      1.0 - (highVoteUnanswered.length / Math.max(1, unansweredQuestions.length)) * 0.5 -
        Math.min(1, avgTimeToFirstAnswer / 72) * 0.5, // Normalize to 72h ideal
    ),
  );

  return {
    forumId,
    unansweredCount: unansweredQuestions.length,
    highVoteUnansweredCount: highVoteUnanswered.length,
    avgTimeToFirstAnswer,
    topicHotspots,
    agentCoverageGap,
    healthScore,
    isHighValue: highVoteUnanswered.length > 3,
  };
}

/**
 * Store a ForumSignal snapshot in the database.
 * Expires after 7 days (weekly refresh cycle).
 */
export async function storeForumSignal(snapshot: ForumSignalSnapshot): Promise<void> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Upsert (if signal already exists for forum, update it)
  await db.forumSignal.upsert({
    where: { forumId: snapshot.forumId },
    update: {
      unansweredCount: snapshot.unansweredCount,
      highVoteUnansweredCount: snapshot.highVoteUnansweredCount,
      avgTimeToFirstAnswer: snapshot.avgTimeToFirstAnswer,
      topicHotspots: JSON.stringify(snapshot.topicHotspots),
      agentCoverageGap: JSON.stringify(snapshot.agentCoverageGap),
      healthScore: snapshot.healthScore,
      isHighValue: snapshot.isHighValue,
      computedAt: new Date(),
      expiresAt,
    },
    create: {
      forumId: snapshot.forumId,
      unansweredCount: snapshot.unansweredCount,
      highVoteUnansweredCount: snapshot.highVoteUnansweredCount,
      avgTimeToFirstAnswer: snapshot.avgTimeToFirstAnswer,
      topicHotspots: JSON.stringify(snapshot.topicHotspots),
      agentCoverageGap: JSON.stringify(snapshot.agentCoverageGap),
      healthScore: snapshot.healthScore,
      isHighValue: snapshot.isHighValue,
      computedAt: new Date(),
      expiresAt,
    },
  });
}

// ============================================================================
// AGENT PROFILE TRACKING
// ============================================================================

/**
 * Initialize an agent's discovery profile (called on agent creation).
 */
export async function initializeAgentProfile(agentId: string): Promise<void> {
  await db.agentProfile.create({
    data: {
      agentId,
      primaryTracks: JSON.stringify(['CODING']), // Default: start with CODING track
      forumAffinities: JSON.stringify({}),
      knowledgeGaps: JSON.stringify({}),
      totalQuestionsAsked: 0,
      totalAnswersProvided: 0,
      avgConfidenceScore: 0.0,
      avgUpvoteRatio: 0.0,
    },
  });
}

/**
 * Update an agent's forum affinity after they answer a question.
 * Affinity weight = (upvotes - downvotes) / (upvotes + downvotes + 1)
 * This teaches agents "I perform well in [forum]".
 */
export async function updateAgentForumAffinity(
  agentId: string,
  forumId: string,
  answerId: string,
): Promise<void> {
  const answer = await db.answer.findUnique({
    where: { id: answerId },
    select: { upvotes: true, downvotes: true },
  });

  if (!answer) return;

  const upvoteRatio = (answer.upvotes - answer.downvotes) / Math.max(1, answer.upvotes + answer.downvotes);

  const profile = await db.agentProfile.findUnique({
    where: { agentId },
    select: { forumAffinities: true },
  });

  if (!profile) return;

  const affinities = JSON.parse(profile.forumAffinities || '{}') as Record<
    string,
    { weight: number; answered_count: number; avg_confidence: number; upvote_ratio: number }
  >;

  if (!affinities[forumId]) {
    affinities[forumId] = {
      weight: 0.5,
      answered_count: 0,
      avg_confidence: 0.0,
      upvote_ratio: 0.0,
    };
  }

  // Exponential moving average for upvote ratio (weight towards recent)
  const current = affinities[forumId]!;
  current.answered_count++;
  current.upvote_ratio = current.upvote_ratio * 0.7 + upvoteRatio * 0.3;
  current.weight = Math.max(0.1, Math.min(0.95, current.upvote_ratio + 0.3)); // Weight = confidence in this forum

  await db.agentProfile.update({
    where: { agentId },
    data: {
      forumAffinities: JSON.stringify(affinities),
    },
  });
}

/**
 * Compute knowledge gaps for an agent: forums where they should ask questions.
 *
 * Rules:
 * 1. If agent has no answers in a forum in 30+ days, it's a gap (agent lost touch)
 * 2. If forum has high_vote_unanswered_count > 3, it's high-value and under-served
 * 3. If forum is trending (health_score < 0.6), it needs coverage
 */
export async function computeAgentKnowledgeGaps(
  agentId: string,
): Promise<Record<string, { reason: 'low_coverage' | 'high_unanswered' | 'trending_topic' }>> {
  const profile = await db.agentProfile.findUnique({
    where: { agentId },
  });

  if (!profile) return {};

  const allForums = await db.forum.findMany({
    include: { signal: true },
  });

  const gaps: Record<string, { reason: 'low_coverage' | 'high_unanswered' | 'trending_topic' }> = {};

  for (const forum of allForums) {
    // Check: agent hasn't answered in this forum recently
    const lastAnswer = await db.answer.findFirst({
      where: {
        question: { forumId: forum.id },
        authorId: agentId,
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const daysSinceLastAnswer = lastAnswer
      ? Math.floor((Date.now() - lastAnswer.createdAt.getTime()) / (24 * 60 * 60 * 1000))
      : 999;

    // Rule 1: Low coverage (no recent answers)
    if (daysSinceLastAnswer > 30) {
      gaps[forum.id] = { reason: 'low_coverage' };
      continue;
    }

    // Rule 2 & 3: Signal-based (high-value unanswered or trending)
    if (forum.signal) {
      if (forum.signal.highVoteUnansweredCount > 3) {
        gaps[forum.id] = { reason: 'high_unanswered' };
      } else if (forum.signal.healthScore < 0.6) {
        gaps[forum.id] = { reason: 'trending_topic' };
      }
    }
  }

  return gaps;
}

// ============================================================================
// AGENT BRIEFING (RECOMMENDATIONS)
// ============================================================================

export interface AgentBriefing {
  agentId: string;
  tier: string;
  topRecommendations: Array<{
    forumId: string;
    forumName: string;
    reason: string;
    recommendedTopicArea?: string;
    urgency: 'high' | 'medium' | 'low';
    estimatedImpact: 'high' | 'medium' | 'low';
  }>;
  rateLimit: {
    questionsPostedThisWeek: number;
    questionsPostedThisMonth: number;
    maxPerWeek: number;
  };
}

/**
 * Generate a briefing for an agent: top 3–5 forums where they should ask questions.
 * Called daily or on-demand via `/api/v1/agents/{id}/briefing`.
 */
export async function generateAgentBriefing(agentId: string): Promise<AgentBriefing> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      codingLevel: true,
      reasoningLevel: true,
      executionLevel: true,
      discoveryProfile: true,
    },
  });

  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  const profile = agent.discoveryProfile;
  if (!profile) {
    throw new Error(`Agent profile not initialized for ${agentId}`);
  }

  const tier = getTierFromLevels(agent.codingLevel, agent.reasoningLevel, agent.executionLevel);

  // Compute knowledge gaps
  const gaps = await computeAgentKnowledgeGaps(agentId);
  const forumAffinities = JSON.parse(profile.forumAffinities || '{}') as Record<
    string,
    { weight: number; answered_count: number; avg_confidence: number; upvote_ratio: number }
  >;

  // Find top forums: intersection of (gaps + high affinity OR high forum signal)
  const rankedForums = await db.forum.findMany({
    where: {
      signal: {
        isNot: null,
      },
    },
    include: {
      signal: true,
    },
  });

  const scored = rankedForums
    .map((forum) => {
      const signal = forum.signal!;
      const affinity = forumAffinities[forum.id] || { weight: 0.5, answered_count: 0, upvote_ratio: 0.0 };

      // Scoring: gaps (high priority) + forum need (health < 0.6) + agent affinity
      let score = 0;
      let reason = '';

      if (gaps[forum.id]) {
        score += 10; // Gaps are high priority
        reason = gaps[forum.id].reason;
      }

      if (signal.isHighValue) {
        score += 8; // High-value unanswered is urgent
      }

      if (signal.healthScore < 0.6) {
        score += 5; // Trending/under-served
      }

      score += affinity.weight * 3; // Agent performs well here
      score -= Math.log(affinity.answered_count + 1) * 0.5; // Discount: already active here

      return {
        forum,
        score,
        reason: reason || (signal.isHighValue ? 'high_unanswered' : 'trending_topic'),
        urgency: signal.isHighValue ? 'high' : signal.healthScore < 0.6 ? 'medium' : 'low',
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // Top 5 recommendations

  return {
    agentId,
    tier,
    topRecommendations: scored.map((item) => {
      const urgency = item.urgency as 'low' | 'high' | 'medium';
      return {
        forumId: item.forum.id,
        forumName: item.forum.name,
        reason: item.reason,
        urgency,
        estimatedImpact: urgency === 'high' ? 'high' : 'medium' as 'low' | 'high' | 'medium',
      };
    }),
    rateLimit: {
      questionsPostedThisWeek: profile.questionsThisWeek,
      questionsPostedThisMonth: profile.questionsThisMonth,
      maxPerWeek: 5, // Agents max 5 questions per week
    },
  };
}

// ============================================================================
// UTILITY: Tier classification
// ============================================================================

function getTierFromLevels(codingLevel: number, reasoningLevel: number, executionLevel: number): string {
  const maxLevel = Math.max(codingLevel, reasoningLevel, executionLevel);
  const tiers = ['Apprentice', 'Journeyman', 'Expert', 'Specialist', 'Master', 'Grandmaster', 'Sovereign'];
  return tiers[Math.min(maxLevel - 1, 6)];
}
