import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import type { ChatOverflowReuseCandidate } from '@/lib/chatoverflow-reuse';
import { buildExternalCandidates, queueExternalCandidates } from '@/lib/external-ingest';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const limit = Math.max(1, Math.min(10, Number(new URL(request.url).searchParams.get('limit') || '5')));

    const question = await db.question.findUnique({
      where: { id },
      select: { id: true, title: true, body: true, forum: { select: { slug: true, name: true } } },
    });

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const query = question.title;
    const candidateInputs = await buildExternalCandidates({
      sourcePlatform: 'CHATOVERFLOW',
      query,
      limit,
    });
    const existingCandidates = await db.externalIngestCandidate.findMany({
      where: { sourceFingerprint: { in: candidateInputs.map((candidate) => candidate.sourceFingerprint) } },
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

    return NextResponse.json({
      question_id: question.id,
      local_question: {
        title: question.title,
        body: question.body,
        forum: question.forum,
      },
      source_platform: 'CHATOVERFLOW',
      coupling_mode: 'READ_ONLY',
      import_mode: 'REVIEW_THEN_IMPORT',
      queue_endpoint: '/api/v1/knowledge/external-candidates',
      review_then_import_endpoint: `/api/v1/questions/${question.id}/reuse/chat-overflow`,
      attribution_rule: 'External matches are read-only suggestions and must preserve ChatOverflow provenance if reused downstream.',
      candidates: candidateInputs.map((candidateInput) => {
        const candidate = candidateInput.rawSourceData as ChatOverflowReuseCandidate;
        const reviewState = reviewStateByFingerprint.get(candidateInput.sourceFingerprint);
        return {
          ...candidate,
          review_state: reviewState
            ? {
                candidate_id: reviewState.id,
                status: reviewState.status,
                review_notes: reviewState.reviewNotes,
                promoted_pattern_id: reviewState.promotedPatternId,
                created_at: reviewState.createdAt.toISOString(),
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error('Question ChatOverflow reuse error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(10, Number(body.limit || new URL(request.url).searchParams.get('limit') || '5')));
    const dryRun = Boolean(body.dry_run ?? false);
    const selectedExternalIds = Array.isArray(body.selected_external_ids)
      ? body.selected_external_ids.map((value) => String(value).trim()).filter(Boolean)
      : [];

    const question = await db.question.findUnique({
      where: { id },
      select: { id: true, title: true, body: true, forum: { select: { slug: true, name: true } } },
    });

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const candidateInputs = await buildExternalCandidates({
      sourcePlatform: 'CHATOVERFLOW',
      query: question.title,
      limit,
    });
    const selectedCandidates = selectedExternalIds.length > 0
      ? candidateInputs.filter((candidate) => selectedExternalIds.includes(candidate.sourceExternalId))
      : candidateInputs;

    if (selectedCandidates.length === 0) {
      return NextResponse.json({ error: 'No matching ChatOverflow candidates selected for review queueing.' }, { status: 400 });
    }

    const queued = await queueExternalCandidates(agent.id, selectedCandidates, {
      dryRun,
      reviewNotes: `Queued from question ${question.id} (${question.title}) via ChatOverflow review route.`,
    });

    return NextResponse.json({
      question_id: question.id,
      local_question: {
        title: question.title,
        body: question.body,
        forum: question.forum,
      },
      source_platform: 'CHATOVERFLOW',
      import_mode: 'REVIEW_THEN_IMPORT',
      selected_external_ids: selectedCandidates.map((candidate) => candidate.sourceExternalId),
      review_queue_path: '/api/v1/knowledge/external-candidates',
      promotion_endpoint_template: '/api/v1/knowledge/external-candidates/{id}/promote',
      ...queued,
    });
  } catch (error) {
    console.error('Queue question ChatOverflow reuse error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}