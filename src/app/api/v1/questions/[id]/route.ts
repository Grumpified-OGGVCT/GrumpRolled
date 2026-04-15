import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildExternalCandidates } from '@/lib/external-ingest';
import { listQuestionAnswerRequests } from '@/lib/question-requests';
import { buildChatOverflowQuestionUrl } from '@/lib/chatoverflow-client';

// GET /api/v1/questions/[id] - Get single question
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const question = await db.question.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
            repScore: true,
          },
        },
        forum: {
          select: { name: true, slug: true },
        },
      },
    });

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    await db.question.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    const answerRequests = await listQuestionAnswerRequests(question.id);
    const outboundCrossPosts = await db.crossPostQueue.findMany({
      where: { sourceQuestionId: question.id },
      orderBy: [{ createdAt: 'desc' }],
      take: 3,
    });

    // Participant-visible reviewed external-intake summary keeps review state on the thread
    // without mutating local question truth.
    let inboundReuseParticipantSummary:
      | {
          source_platform: 'CHATOVERFLOW';
          review_visible_on_thread: true;
          summary_status: 'AVAILABLE' | 'UNAVAILABLE';
          candidates: Array<{
            external_id: string;
            title: string;
            forum_name: string;
            author_username: string;
            score: number;
            answer_count: number;
            reuse_score: number;
            url: string;
            review_state: {
              candidate_id: string;
              status: 'QUEUED' | 'IMPORTED_PATTERN' | 'DUPLICATE' | 'REJECTED';
              review_notes: string | null;
              promoted_pattern_id: string | null;
              created_at: string;
            } | null;
          }>;
          note?: string;
        }
      | null = null;

    try {
      const candidateInputs = await buildExternalCandidates({
        sourcePlatform: 'CHATOVERFLOW',
        query: question.title,
        limit: 4,
      });
      const existingCandidates = await db.externalIngestCandidate.findMany({
        where: {
          sourceFingerprint: { in: candidateInputs.map((candidate) => candidate.sourceFingerprint) },
        },
        select: {
          id: true,
          sourceFingerprint: true,
          status: true,
          reviewNotes: true,
          promotedPatternId: true,
          createdAt: true,
        },
      });
      const reviewStateByFingerprint = new Map(existingCandidates.map((candidate) => [candidate.sourceFingerprint, candidate]));

      inboundReuseParticipantSummary = {
        source_platform: 'CHATOVERFLOW',
        review_visible_on_thread: true,
        summary_status: 'AVAILABLE',
        candidates: candidateInputs.map((candidateInput) => {
          const candidate = candidateInput.rawSourceData as {
            question: {
              id: string;
              title: string;
              forum_name: string;
              author_username: string;
              score: number;
              answer_count: number;
              url: string;
            };
            reuse_score: number;
          };
          const reviewState = reviewStateByFingerprint.get(candidateInput.sourceFingerprint);

          return {
            external_id: candidate.question.id,
            title: candidate.question.title,
            forum_name: candidate.question.forum_name,
            author_username: candidate.question.author_username,
            score: candidate.question.score,
            answer_count: candidate.question.answer_count,
            reuse_score: candidate.reuse_score,
            url: candidate.question.url,
            review_state: reviewState
              ? {
                  candidate_id: reviewState.id,
                  status: reviewState.status as 'QUEUED' | 'IMPORTED_PATTERN' | 'DUPLICATE' | 'REJECTED',
                  review_notes: reviewState.reviewNotes,
                  promoted_pattern_id: reviewState.promotedPatternId,
                  created_at: reviewState.createdAt.toISOString(),
                }
              : null,
          };
        }),
      };
    } catch (error) {
      console.error('Question inbound reuse summary error:', error);
      inboundReuseParticipantSummary = {
        source_platform: 'CHATOVERFLOW',
        review_visible_on_thread: true,
        summary_status: 'UNAVAILABLE',
        candidates: [],
        note: 'Reviewed external-intake status is temporarily unavailable.',
      };
    }

    return NextResponse.json({
      id: question.id,
      title: question.title,
      body: question.body,
      tags: JSON.parse(question.tags || '[]'),
      upvotes: question.upvotes,
      answer_count: question.answerCount,
      accepted_answer_id: question.acceptedAnswerId,
      status: question.status,
      view_count: question.viewCount + 1,
      bounty_rep: question.bountyRep,
      inbound_reuse: {
        chat_overflow_matches_path: `/api/v1/questions/${question.id}/reuse/chat-overflow`,
        chat_overflow_review_path: `/api/v1/questions/${question.id}/reuse/chat-overflow`,
        queue_candidates_path: '/api/v1/knowledge/external-candidates',
        mode: 'REVIEWABLE_SUGGESTIONS',
        participant_summary: inboundReuseParticipantSummary,
      },
      // Ask-to-Answer routing stays question-bound and participant visible through the request ledger.
      ask_to_answer: {
        list_path: `/api/v1/questions/${question.id}/requests`,
        create_path: `/api/v1/questions/${question.id}/requests`,
        requests: answerRequests,
      },
      outbound_federation: {
        chat_overflow_queue_path: '/api/v1/federation/cross-posts',
        queue_entries: outboundCrossPosts.map((entry) => ({
          id: entry.id,
          status: entry.status,
          confidence: entry.confidence,
          verification_method: entry.verificationMethod,
          chat_overflow_post_id: entry.chatOverflowPostId,
          external_url: entry.chatOverflowPostId ? buildChatOverflowQuestionUrl(entry.chatOverflowPostId) : null,
          attempt_count: entry.attemptCount,
          last_error: entry.lastError,
          ready_at: entry.readyAt.toISOString(),
          sent_at: entry.sentAt?.toISOString() || null,
          created_at: entry.createdAt.toISOString(),
        })),
      },
      author: question.author,
      forum: question.forum,
      created_at: question.createdAt.toISOString(),
      updated_at: question.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Get question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
