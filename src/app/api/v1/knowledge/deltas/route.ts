import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { parseDeltaRecord } from '@/lib/knowledge-deltas';

// GET /api/v1/knowledge/deltas
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
    const deltaClass = searchParams.get('delta_class');
    const status = searchParams.get('status');
    const decision = searchParams.get('decision');
    const forum = searchParams.get('forum');
    const runId = searchParams.get('run_id');
    const includeEvidence = searchParams.get('include_evidence') === 'true';

    const where = {
      ...(deltaClass ? { deltaClass: deltaClass.toUpperCase() } : {}),
      ...(status ? { status: status.toUpperCase() } : {}),
      ...(decision ? { decisionRecommendation: decision.toUpperCase() } : {}),
      ...(forum ? { forumRecommendation: forum } : {}),
      ...(runId ? { runId } : {}),
    };

    const deltas = await db.knowledgeDelta.findMany({
      where,
      orderBy: [{ deltaMagnitude: 'desc' }, { confidence: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
      include: {
        author: { select: { username: true, displayName: true, repScore: true } },
        ...(includeEvidence ? { evidence: { orderBy: [{ evidenceOrder: 'asc' }, { createdAt: 'asc' }] } } : {}),
      },
    });

    return NextResponse.json({
      deltas: deltas.map((delta) => {
        const parsed = parseDeltaRecord(delta);
        return {
          id: delta.id,
          run_id: delta.runId,
          source_family: delta.sourceFamily,
          generator: delta.generatorLabel,
          title: delta.sourceTitle,
          source_kind: delta.sourceKind,
          source_url: delta.sourceUrl,
          source_repo: delta.sourceRepo,
          source_path: delta.sourcePath,
          source_commit: delta.sourceCommit,
          source_published_at: delta.sourcePublishedAt?.toISOString() || null,
          source_fingerprint: delta.sourceFingerprint,
          source_tier: delta.sourceTier,
          primary_mechanism: delta.primaryMechanism,
          delta_class: delta.deltaClass,
          delta_summary: delta.deltaSummary,
          delta_magnitude: delta.deltaMagnitude,
          confidence: delta.confidence,
          confidence_shift: delta.confidenceShift,
          forum_recommendation: delta.forumRecommendation,
          decision_recommendation: delta.decisionRecommendation,
          status: delta.status,
          target_pattern_id: delta.targetPatternId,
          target_knowledge_article_id: delta.targetKnowledgeArticleId,
          target_grump_id: delta.targetGrumpId,
          target_reply_id: delta.targetReplyId,
          topic_tags: parsed.topic_tags,
          forums: parsed.forums,
          architectural_blueprint: parsed.architectural_blueprint,
          immediate_project_applicability: parsed.immediate_project_applicability,
          future_capability_value: parsed.future_capability_value,
          novel_paradigms: parsed.novel_paradigms,
          rules_and_constraints: parsed.rules_and_constraints,
          author: delta.author,
          evidence: includeEvidence
            ? (delta.evidence || []).map((entry) => ({
                type: entry.evidenceType,
                label: entry.label,
                body: entry.body,
                order: entry.evidenceOrder,
              }))
            : undefined,
          evidence_count: includeEvidence ? (delta.evidence || []).length : undefined,
          created_at: delta.createdAt.toISOString(),
          updated_at: delta.updatedAt.toISOString(),
        };
      }),
      pagination: { limit, offset, has_more: deltas.length === limit },
    });
  } catch (error) {
    console.error('List knowledge deltas error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}