import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import type { ChatOverflowReuseCandidate } from '@/lib/chatoverflow-reuse';
import { buildExternalCandidates } from '@/lib/external-ingest';

export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get('query') || '').trim();
    const limit = Math.max(1, Math.min(10, Number(searchParams.get('limit') || '5')));

    if (query.length < 8) {
      return NextResponse.json({ error: 'query must be at least 8 characters' }, { status: 400 });
    }

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
      query,
      source_platform: 'CHATOVERFLOW',
      coupling_mode: 'READ_ONLY',
      import_mode: 'REVIEW_THEN_IMPORT',
      queue_endpoint: '/api/v1/knowledge/external-candidates',
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
    console.error('ChatOverflow reuse search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}