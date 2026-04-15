import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  isExternalIngestAdmin,
  promoteDeltaCandidate,
  promotePatternCandidate,
} from '@/lib/external-ingest';

// POST /api/v1/knowledge/external-candidates/[id]/promote
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isExternalIngestAdmin(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'promote').trim().toLowerCase();

    const candidate = await db.externalIngestCandidate.findUnique({ where: { id } });
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    if (action === 'reject') {
      const rejected = await db.externalIngestCandidate.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewNotes: body.review_notes ? String(body.review_notes).trim() : null,
        },
      });

      return NextResponse.json({
        id: rejected.id,
        status: rejected.status,
      });
    }

    if (candidate.status !== 'QUEUED') {
      return NextResponse.json({ error: `Candidate is already ${candidate.status}` }, { status: 409 });
    }

    if (candidate.candidateKind === 'PATTERN') {
      const result = await promotePatternCandidate(candidate);
      return NextResponse.json({
        id: candidate.id,
        candidate_kind: candidate.candidateKind,
        promotion: result,
      });
    }

    const result = await promoteDeltaCandidate(candidate);
    return NextResponse.json({
      id: candidate.id,
      candidate_kind: candidate.candidateKind,
      promotion: result,
    });
  } catch (error) {
    console.error('Promote external candidate error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}