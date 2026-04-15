import { db } from '@/lib/db';

export interface CreateCrossPostQueueEntry {
  sourceQuestionId: string;
  sourceAnswerId: string;
  sourcePlatform: string;
  sourceUrl: string;
  sourceForumTag: string;
  questionText: string;
  answerText: string;
  confidence: number;
  verificationMethod: string;
  dedupKey: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  readyAt: Date;
}

export interface WeeklyCrossPostStats {
  statusBreakdown: Array<{
    status: string;
    count: number;
    avgConfidence: number | null;
  }>;
  borderlineCount: number;
  dedupHitsCount: number;
}

export const crossPostQueueRepository = {
  findRecentByQuestion(sourceQuestionId: string, since: Date) {
    return db.crossPostQueue.findFirst({
      where: {
        sourceQuestionId,
        createdAt: { gte: since },
      },
    });
  },

  findByDedupKeyAndPlatform(dedupKey: string, sourcePlatform: string) {
    return db.crossPostQueue.findFirst({
      where: {
        dedupKey,
        sourcePlatform,
      },
    });
  },

  create(entry: CreateCrossPostQueueEntry) {
    return db.crossPostQueue.create({ data: entry });
  },

  findPendingReady(cutoff: Date, maxCount: number) {
    return db.crossPostQueue.findMany({
      where: {
        status: 'PENDING',
        readyAt: { lte: new Date() },
        createdAt: { gte: cutoff },
      },
      orderBy: [{ confidence: 'desc' }, { readyAt: 'asc' }],
      take: maxCount,
    });
  },

  async markSent(queueId: string, chatOverflowPostId: string): Promise<void> {
    await db.crossPostQueue.update({
      where: { id: queueId },
      data: {
        status: 'SENT',
        chatOverflowPostId,
        sentAt: new Date(),
      },
    });
  },

  findById(queueId: string) {
    return db.crossPostQueue.findUnique({ where: { id: queueId } });
  },

  async updateFailure(queueId: string, attemptCount: number, shouldGiveUp: boolean, errorMessage: string): Promise<void> {
    await db.crossPostQueue.update({
      where: { id: queueId },
      data: {
        status: shouldGiveUp ? 'FAILED' : 'PENDING',
        attemptCount,
        lastError: errorMessage,
        lastAttemptAt: new Date(),
      },
    });
  },

  async getWeeklyStats(weekAgo: Date): Promise<WeeklyCrossPostStats> {
    const grouped = await db.crossPostQueue.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: weekAgo },
      },
      _count: {
        status: true,
      },
      _avg: {
        confidence: true,
      },
    });

    const borderlineCount = await db.crossPostQueue.count({
      where: {
        createdAt: { gte: weekAgo },
        confidence: { gte: 0.8, lte: 0.85 },
      },
    });

    const dedupHitsCount = await db.crossPostQueue.count({
      where: {
        createdAt: { gte: weekAgo },
        status: 'SKIPPED',
      },
    });

    return {
      statusBreakdown: grouped.map((entry) => ({
        status: entry.status,
        count: entry._count.status,
        avgConfidence: entry._avg.confidence,
      })),
      borderlineCount,
      dedupHitsCount,
    };
  },
};
