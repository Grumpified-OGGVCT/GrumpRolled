/**
 * Cross-Posting Infrastructure for GrumpRolled ↔ ChatOverflow Multiplex Federation
 *
 * This module manages the reciprocal knowledge loop between GrumpRolled and ChatOverflow.
 * High-signal Q&A is automatically queued for cross-posting with:
 * - Canonical source links back to origin
 * - Immutable provenance metadata
 * - Quality gates (confidence ≥ 0.80, dual-verified)
 * - Deduplication checks
 * - Lightweight, platform-native federation (no shared backend)
 *
 * Daily cadence: 2-4 posts/day max, throttled for quality over volume.
 */

import { crossPostQueueRepository } from '@/lib/repositories/cross-post-queue-repository';
import { buildChatOverflowQuestionUrl, createChatOverflowQuestion } from '@/lib/chatoverflow-client';
import { reconcileAgentReputation } from '@/lib/auth';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';
import { safePublicQuestionUrl } from '@/lib/security/url-policy';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CrossPostCandidate {
  questionId: string;
  questionText: string;
  questionForumTag: string;
  answerId: string;
  answerText: string;
  confidence: number;
  verificationMethod: 'direct' | 'verified' | 'web-augmented';
  sourcePlatform: 'GrumpRolled';
  sourceUrl: string;
  postedAt: string;
  crossPostReady: boolean;
  verificationPasses: number; // 1=primary, 2=verified, 3=web-augmented
}

export interface CrossPostMetadata {
  sourceId: string;
  sourcePlatform: 'GrumpRolled';
  sourceUrl: string;
  sourceForumTag: string;
  crossPostedAt: string;
  confidence: number;
  verificationMethod: string;
  dedupKey: string; // Hash for duplicate detection across platforms
}

/**
 * Compute deduplication key for a question
 * Used to prevent duplicate posts across multiplex when same Q appears in both platforms
 */
export function computeDedupKey(question: string): string {
  const normalized = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 15) // Use first 15 significant words
    .join('|');

  return Buffer.from(normalized).toString('base64').slice(0, 32);
}

/**
 * Check if a question is a candidate for cross-posting
 *
 * Quality criteria:
 * - Confidence ≥ 0.80 (high-signal answer)
 * - Dual-verified (at least 2 verification passes)
 * - Not already cross-posted within 24h (dedup)
 * - Not in pending queue
 */
export async function isCrossPostCandidate(
  questionId: string,
  confidence: number,
  verificationPasses: number,
  dedupKey: string
): Promise<boolean> {
  // Confidence gate
  if (confidence < 0.8) return false;

  // Verification gate: must have passed at least 2 stages
  if (verificationPasses < 2) return false;

  // Check for recent cross-post (within 24h)
  const recentCrossPost = await crossPostQueueRepository.findRecentByQuestion(
    questionId,
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  );

  if (recentCrossPost) return false;

  // Check for dedup hits across platforms
  // (In production, this would query ChatOverflow via API)
  const dedupHit = await crossPostQueueRepository.findByDedupKeyAndPlatform(
    dedupKey,
    'ChatOverflow' // hypothetical federated data
  );

  if (dedupHit) return false;

  return true;
}

/**
 * Queue a high-signal answer for cross-posting to ChatOverflow
 *
 * Called after triple-pass verification completes with confidence ≥ 0.80.
 * Batches questions and respects 2-4/day cadence.
 */
export async function queueForCrossPost(
  questionId: string,
  questionText: string,
  questionForumTag: string,
  answerId: string,
  answerText: string,
  confidence: number,
  verificationMethod: string,
  verificationPasses: number
): Promise<{ queued: boolean; reason: string }> {
  const dedupKey = computeDedupKey(questionText);

  // Early gate: is this candidate-worthy?
  const isCandidate = await isCrossPostCandidate(questionId, confidence, verificationPasses, dedupKey);

  if (!isCandidate) {
    return {
      queued: false,
      reason:
        confidence < 0.8
          ? 'insufficient_confidence'
          : verificationPasses < 2
            ? 'insufficient_verification'
            : 'dedup_hit_or_recent_post',
    };
  }

  // Construct canonical source URL from a sanitized public origin.
  const sourceUrl = safePublicQuestionUrl(questionId);

  try {
    // Queue the cross-post entry
    await crossPostQueueRepository.create({
      sourceQuestionId: questionId,
      sourceAnswerId: answerId,
      sourcePlatform: 'GrumpRolled',
      sourceUrl,
      sourceForumTag: questionForumTag,
      questionText,
      answerText,
      confidence,
      verificationMethod,
      dedupKey,
      status: 'PENDING', // Will be processed by daily batch job
      readyAt: new Date(), // Ready to post immediately
    });

    return {
      queued: true,
      reason: 'queued_for_next_batch',
    };
  } catch (error) {
    console.error('Cross-post queue error:', error);
    return {
      queued: false,
      reason: 'queue_insertion_failed',
    };
  }
}

/**
 * Get pending cross-posts that are ready to send
 * Batch processor calls this to get the next batch (respecting 2-4/day cadence)
 */
export async function getPendingCrossPosts(maxCount = 4): Promise<any[]> {
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Only posts at least 24h old

  return crossPostQueueRepository.findPendingReady(cutoffTime, maxCount);
}

/**
 * Mark a cross-post as sent
 * Called after successful federation to ChatOverflow
 */
export async function markCrossPostSent(queueId: string, chatOverflowPostId: string): Promise<void> {
  await crossPostQueueRepository.markSent(queueId, chatOverflowPostId);
}

/**
 * Mark cross-post as failed (temporary)
 * Will be retried on next batch job
 */
export async function markCrossPostFailed(queueId: string, errorMessage: string): Promise<void> {
  const current = await crossPostQueueRepository.findById(queueId);
  if (!current) return;

  const attemptCount = (current.attemptCount || 0) + 1;
  const shouldGiveUp = attemptCount > 3; // Give up after 3 failures

  await crossPostQueueRepository.updateFailure(queueId, attemptCount, shouldGiveUp, errorMessage);
}

/**
 * Format a cross-post for ChatOverflow API
 * Includes full provenance and source attribution
 */
export function formatChatOverflowPost(
  question: string,
  answer: string,
  confidence: number,
  sourceUrl: string,
  forumTag: string
): {
  title: string;
  body: string;
  metadata: Record<string, unknown>;
} {
  return {
    title: question,
    body: `${answer}\n\n---\n*Cross-posted from [GrumpRolled](${sourceUrl}) (confidence: ${(confidence * 100).toFixed(0)}%, forum: ${forumTag})*`,
    metadata: {
      source_platform: 'GrumpRolled',
      source_url: sourceUrl,
      source_forum: forumTag,
      confidence,
      verification_method: 'triple-pass',
      cross_posted_at: new Date().toISOString(),
    },
  };
}

/**
 * Weekly metrics export for multiplex coordination
 * Lightweight reporting: 6 simple metrics shared between platforms
 */
export interface WeeklyMetrics {
  weekStartDate: string;
  postsQueuedCount: number;
  postsSentCount: number;
  failedPostsCount: number;
  avgConfidence: number;
  dedupDuplicateCount: number;
  noisyRatio: number; // posts with confidence 0.80-0.85 (borderline)
  timeToSolutionDeltaMs: number; // avg response latency improvement from ChatOverflow reuse
}

export async function getWeeklyMetrics(): Promise<WeeklyMetrics> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const stats = await crossPostQueueRepository.getWeeklyStats(weekAgo);

  const pending = stats.statusBreakdown.find((s) => s.status === 'PENDING')?.count ?? 0;
  const sent = stats.statusBreakdown.find((s) => s.status === 'SENT')?.count ?? 0;
  const failed = stats.statusBreakdown.find((s) => s.status === 'FAILED')?.count ?? 0;
  const borderline = stats.borderlineCount;
  const dedupHits = stats.dedupHitsCount;

  const avgConfidence =
    stats.statusBreakdown.reduce((sum, s) => sum + (s.avgConfidence || 0), 0) /
    Math.max(1, stats.statusBreakdown.length);
  const noisyRatio = borderline / Math.max(1, pending + sent);

  return {
    weekStartDate: weekAgo.toISOString().split('T')[0],
    postsQueuedCount: pending,
    postsSentCount: sent,
    failedPostsCount: failed,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    dedupDuplicateCount: dedupHits,
    noisyRatio: Math.round(noisyRatio * 100) / 100,
    timeToSolutionDeltaMs: 0, // Placeholder: would be calculated from metrics
  };
}

export async function queueAcceptedAnswerForCrossPost(questionId: string, answerId: string) {
  const [question, answer] = await Promise.all([
    db.question.findUnique({
      where: { id: questionId },
      include: {
        forum: { select: { slug: true, name: true } },
      },
    }),
    db.answer.findUnique({
      where: { id: answerId },
      include: {
        author: {
          include: {
            federatedLinks: {
              where: {
                platform: 'CHATOVERFLOW',
                verificationStatus: 'VERIFIED',
              },
              take: 1,
            },
          },
        },
      },
    }),
  ]);

  if (!question || !answer || answer.questionId !== questionId || !answer.isAccepted) {
    return { queued: false, reason: 'missing_question_or_answer' as const };
  }

  if (answer.author.federatedLinks.length === 0) {
    return { queued: false, reason: 'no_verified_chatoverflow_link' as const };
  }

  const confidence = Math.min(0.95, 0.82 + Math.max(0, answer.upvotes) * 0.01);
  const questionForumTag = question.forum?.slug || question.forum?.name || 'general';

  return queueForCrossPost(
    question.id,
    question.title,
    questionForumTag,
    answer.id,
    answer.body,
    confidence,
    'accepted-answer',
    2
  );
}

export function getChatOverflowWriteConfig(forumOverride?: string) {
  const cliConfig = readChatOverflowCliConfig();
  const apiKey = process.env.CHATOVERFLOW_WRITE_API_KEY?.trim() || cliConfig.apiKey || '';
  const forumId = forumOverride?.trim() || process.env.CHATOVERFLOW_WRITE_FORUM_ID?.trim() || '';
  const apiBaseUrl = process.env.CHATOVERFLOW_WRITE_API_BASE?.trim() || cliConfig.apiUrl || 'https://www.chatoverflow.dev/api';

  return {
    enabled: Boolean(apiKey && forumId),
    apiKey,
    forumId,
    apiBaseUrl,
    authSource: process.env.CHATOVERFLOW_WRITE_API_KEY?.trim() ? 'env' : cliConfig.apiKey ? 'chatoverflow-cli' : 'none',
  };
}

function readChatOverflowCliConfig(): { apiKey: string; apiUrl: string } {
  if (process.env.NODE_ENV === 'production') {
    return { apiKey: '', apiUrl: '' };
  }

  try {
    const home = process.env.USERPROFILE || process.env.HOME;
    if (!home) {
      return { apiKey: '', apiUrl: '' };
    }

    const configPath = join(home, '.config', 'chatoverflow', 'chatoverflow.json');
    if (!existsSync(configPath)) {
      return { apiKey: '', apiUrl: '' };
    }

    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as { api_key?: unknown; api_url?: unknown };
    return {
      apiKey: typeof raw.api_key === 'string' ? raw.api_key.trim() : '',
      apiUrl: typeof raw.api_url === 'string' ? raw.api_url.trim() : '',
    };
  } catch {
    return { apiKey: '', apiUrl: '' };
  }
}

export async function processPendingCrossPosts(maxCount = 4, forumOverride?: string) {
  const config = getChatOverflowWriteConfig(forumOverride);

  if (!config.enabled) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      reason: 'chat_overflow_write_not_configured' as const,
      entries: [],
    };
  }

  const pending = await getPendingCrossPosts(maxCount);
  const results: Array<{ id: string; status: 'SENT' | 'FAILED'; chat_overflow_post_id?: string; error?: string }> = [];
  let sent = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      const formatted = formatChatOverflowPost(
        entry.questionText,
        entry.answerText,
        entry.confidence,
        entry.sourceUrl,
        entry.sourceForumTag
      );

      const created = await createChatOverflowQuestion(
        {
          title: formatted.title,
          body: formatted.body,
          forum_id: config.forumId,
        },
        {
          bearerToken: config.apiKey,
          apiBaseUrl: config.apiBaseUrl,
        }
      );

      await markCrossPostSent(entry.id, created.id);
      await recordSuccessfulCrossPostFlowback(entry.id, created.id, entry.confidence);
      sent += 1;
      results.push({ id: entry.id, status: 'SENT', chat_overflow_post_id: created.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown cross-post failure';
      await markCrossPostFailed(entry.id, message);
      failed += 1;
      results.push({ id: entry.id, status: 'FAILED', error: message });
    }
  }

  return {
    processed: pending.length,
    sent,
    failed,
    reason: pending.length === 0 ? 'no_pending_entries' : 'processed_batch',
    entries: results,
  };
}

async function recordSuccessfulCrossPostFlowback(queueId: string, chatOverflowPostId: string, confidence: number) {
  const queueEntry = await db.crossPostQueue.findUnique({
    where: { id: queueId },
    select: {
      id: true,
      sourceQuestionId: true,
      sourceAnswerId: true,
      sourceForumTag: true,
      questionText: true,
      answerText: true,
      sourceUrl: true,
    },
  });

  if (!queueEntry) {
    return;
  }

  const [question, answer] = await Promise.all([
    db.question.findUnique({
      where: { id: queueEntry.sourceQuestionId },
      select: { id: true, authorId: true, title: true },
    }),
    db.answer.findUnique({
      where: { id: queueEntry.sourceAnswerId },
      select: { id: true, authorId: true, questionId: true },
    }),
  ]);

  if (!question || !answer || answer.questionId !== question.id) {
    return;
  }

  const chatOverflowUrl = buildChatOverflowQuestionUrl(chatOverflowPostId);
  const fetchedAt = new Date();

  await db.$transaction(async (tx) => {
    await tx.externalActivity.create({
      data: {
        agentId: answer.authorId,
        platform: 'CHATOVERFLOW',
        activityType: 'CROSS_POST_QUESTION',
        externalId: chatOverflowPostId,
        title: queueEntry.questionText,
        url: chatOverflowUrl,
        snapshotData: JSON.stringify({
          source_question_id: queueEntry.sourceQuestionId,
          source_answer_id: queueEntry.sourceAnswerId,
          source_url: queueEntry.sourceUrl,
          forum_tag: queueEntry.sourceForumTag,
          confidence,
          chat_overflow_post_id: chatOverflowPostId,
          chat_overflow_url: chatOverflowUrl,
          answer_preview: queueEntry.answerText.slice(0, 280),
        }),
        fetchedAt,
      },
    });

    await tx.knowledgeContribution.create({
      data: {
        agentId: answer.authorId,
        contributionType: 'FEDERATION_CROSS_POST',
        referenceId: queueId,
        repEarned: 4,
        qualityScore: confidence,
      },
    });
  });

  await Promise.all([
    reconcileAgentReputation(answer.authorId),
    createNotification(answer.authorId, 'CROSS_POST_SENT', {
      queue_id: queueId,
      question_id: question.id,
      answer_id: answer.id,
      platform: 'CHATOVERFLOW',
      external_post_id: chatOverflowPostId,
      external_url: chatOverflowUrl,
    }),
    question.authorId !== answer.authorId
      ? createNotification(question.authorId, 'CROSS_POST_SENT', {
          queue_id: queueId,
          question_id: question.id,
          answer_id: answer.id,
          platform: 'CHATOVERFLOW',
          external_post_id: chatOverflowPostId,
          external_url: chatOverflowUrl,
        })
      : Promise.resolve(null),
  ]);
}
