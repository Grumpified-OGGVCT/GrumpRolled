import { NextRequest, NextResponse } from 'next/server';

import { authenticateAgent, authenticateAgentRequest } from '@/lib/auth';
import { isAdminRequest } from '@/lib/admin';
import { db } from '@/lib/db';
import {
  buildExternalCandidates,
  queueExternalCandidates,
} from '@/lib/external-ingest';

// GET /api/v1/knowledge/external-candidates
export async function GET(request: NextRequest) {
  try {
    const admin = isAdminRequest(request);
    const agent = admin ? null : await authenticateAgentRequest(request);
    if (!admin && !agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const sourcePlatform = searchParams.get('source_platform');
    const candidateKind = searchParams.get('candidate_kind');
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || '20')));

    const candidates = await db.externalIngestCandidate.findMany({
      where: {
        ...(admin ? {} : { queuedByAgentId: agent!.id }),
        ...(status ? { status: status.toUpperCase() } : {}),
        ...(sourcePlatform ? { sourcePlatform: sourcePlatform.toUpperCase() } : {}),
        ...(candidateKind ? { candidateKind: candidateKind.toUpperCase() } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        queuedByAgent: { select: { username: true, displayName: true } },
      },
    });

    return NextResponse.json({
      scope: admin ? 'ADMIN_ALL' : 'AGENT_OWNED',
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        source_platform: candidate.sourcePlatform,
        candidate_kind: candidate.candidateKind,
        status: candidate.status,
        title: candidate.title,
        description: candidate.description,
        external_username: candidate.externalUsername,
        source_external_id: candidate.sourceExternalId,
        source_url: candidate.sourceUrl,
        source_fingerprint: candidate.sourceFingerprint,
        source_tier: candidate.sourceTier,
        confidence: candidate.confidence,
        review_notes: candidate.reviewNotes,
        fact_check_score: candidate.factCheckScore,
        execution_score: candidate.executionScore,
        citation_score: candidate.citationScore,
        expert_score: candidate.expertScore,
        community_score: candidate.communityScore,
        promoted_pattern_id: candidate.promotedPatternId,
        promoted_delta_id: candidate.promotedDeltaId,
        queued_by: candidate.queuedByAgent,
        created_at: candidate.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('List external ingest candidates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/knowledge/external-candidates
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const sourcePlatform = String(body.source_platform || '').trim().toUpperCase() as 'CHATOVERFLOW' | 'MOLTBOOK';
    const query = body.query ? String(body.query).trim() : undefined;
    const externalUsername = body.external_username ? String(body.external_username).trim() : undefined;
    const limit = Math.max(1, Math.min(10, Number(body.limit || '5')));
    const dryRun = Boolean(body.dry_run ?? false);

    if (sourcePlatform !== 'CHATOVERFLOW' && sourcePlatform !== 'MOLTBOOK') {
      return NextResponse.json({ error: 'source_platform must be CHATOVERFLOW or MOLTBOOK' }, { status: 400 });
    }

    const candidates = await buildExternalCandidates({
      sourcePlatform,
      query,
      externalUsername,
      limit,
    });
    const queued = await queueExternalCandidates(agent.id, candidates, { dryRun });

    return NextResponse.json({
      source_platform: sourcePlatform,
      requested_limit: limit,
      candidate_count: candidates.length,
      ...queued,
      import_mode: 'REVIEW_THEN_IMPORT',
    });
  } catch (error) {
    console.error('Queue external ingest candidates error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}