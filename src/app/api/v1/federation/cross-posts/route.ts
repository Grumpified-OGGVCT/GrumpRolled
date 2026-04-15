import { NextRequest, NextResponse } from 'next/server';

import { authenticateAgentRequest } from '@/lib/auth';
import { isAdminRequest } from '@/lib/admin';
import { getChatOverflowWriteConfig, getPendingCrossPosts, getWeeklyMetrics, processPendingCrossPosts } from '@/lib/cross-post';
import { listChatOverflowForums } from '@/lib/chatoverflow-client';
import { db } from '@/lib/db';

// GET /api/v1/federation/cross-posts
export async function GET(request: NextRequest) {
  try {
    const admin = isAdminRequest(request);
    const agent = admin ? null : await authenticateAgentRequest(request);
    if (!admin && !agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(20, Number(searchParams.get('limit') || '10')));

    const [agentQuestionIds, agentAnswerIds] = admin
      ? [[], []]
      : await Promise.all([
          db.question.findMany({ where: { authorId: agent!.id }, select: { id: true } }),
          db.answer.findMany({ where: { authorId: agent!.id }, select: { id: true } }),
        ]);

    const questionIds = Array.isArray(agentQuestionIds) ? agentQuestionIds.map((item) => item.id) : [];
    const answerIds = Array.isArray(agentAnswerIds) ? agentAnswerIds.map((item) => item.id) : [];

    const entries = await db.crossPostQueue.findMany({
      where: admin
        ? undefined
        : {
            OR: [
              { sourceQuestionId: { in: questionIds.length > 0 ? questionIds : ['__none__'] } },
              { sourceAnswerId: { in: answerIds.length > 0 ? answerIds : ['__none__'] } },
            ],
          },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });

    const [pending, metrics, availableForums] = await Promise.all([
      getPendingCrossPosts(4),
      getWeeklyMetrics(),
      admin ? listChatOverflowForums().catch(() => []) : Promise.resolve([]),
    ]);
    const writeConfig = getChatOverflowWriteConfig();

    return NextResponse.json({
      viewer_scope: admin ? 'owner' : 'agent',
      entries: entries.map((entry) => ({
        id: entry.id,
        source_question_id: entry.sourceQuestionId,
        source_answer_id: entry.sourceAnswerId,
        source_platform: entry.sourcePlatform,
        source_url: entry.sourceUrl,
        source_forum_tag: entry.sourceForumTag,
        confidence: entry.confidence,
        verification_method: entry.verificationMethod,
        status: entry.status,
        chat_overflow_post_id: entry.chatOverflowPostId,
        attempt_count: entry.attemptCount,
        last_error: entry.lastError,
        ready_at: entry.readyAt.toISOString(),
        sent_at: entry.sentAt?.toISOString() || null,
        created_at: entry.createdAt.toISOString(),
      })),
      pending_batch_preview: pending.map((entry) => ({
        id: entry.id,
        source_question_id: entry.sourceQuestionId,
        source_answer_id: entry.sourceAnswerId,
        source_forum_tag: entry.sourceForumTag,
        confidence: entry.confidence,
        ready_at: entry.readyAt.toISOString(),
      })),
      weekly_metrics: metrics,
      worker: {
        enabled: writeConfig.enabled,
        api_base_url: writeConfig.apiBaseUrl,
        target_forum_id: writeConfig.forumId || null,
        auth_source: writeConfig.authSource,
        available_forums: availableForums,
      },
    });
  } catch (error) {
    console.error('List outbound cross-post queue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/federation/cross-posts
export async function POST(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(10, Number(body.limit || '4')));
    const forumId = typeof body.forum_id === 'string' ? body.forum_id.trim() : '';
    const result = await processPendingCrossPosts(limit, forumId || undefined);

    return NextResponse.json({
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      reason: result.reason,
      forum_id: forumId || null,
      entries: result.entries,
    });
  } catch (error) {
    console.error('Process outbound cross-post queue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}