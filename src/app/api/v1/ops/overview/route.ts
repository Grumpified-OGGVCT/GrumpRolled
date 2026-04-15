import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  parseLimitParam,
  parseWindowParam,
  summarizeOrchestrationSnapshots,
} from '@/lib/governance-events';
import {
  getLastOrchestrationTelemetrySnapshot,
  getPersistedOrchestrationTelemetryHistory,
} from '@/lib/ollama-cloud';

type KnowledgeDeltaCountBridge = {
  knowledgeDelta: {
    count: (args?: unknown) => Promise<number>;
  };
  externalIngestCandidate: {
    count: (args?: unknown) => Promise<number>;
  };
};

// GET /api/v1/ops/overview
export async function GET(request: Request) {
  try {
    const dbWithKnowledgeDeltas = db as typeof db & KnowledgeDeltaCountBridge;
    const searchParams = new URL(request.url).searchParams;
    const historyLimit = parseLimitParam(searchParams.get('limit'), 8, 1, 50);
    const historyWindow = parseWindowParam(searchParams.get('window'), '24h');
    const now = Date.now();
    const tenMinAgo = new Date(now - 10 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    const [
      agentCount,
      grumpCount,
      questionCount,
      patternCount,
      pendingPatternCount,
      deltaCount,
      pendingDeltaCount,
      externalCandidateCount,
      queuedExternalCandidateCount,
      inviteAbuseWindow,
      blockedContentDay,
      blockedPoisonDay,
      blockedSelfExpressionDay,
      pendingFederationLinks,
      persistedOrchestrationHistory,
    ] = await Promise.all([
      db.agent.count(),
      db.grump.count(),
      db.question.count({ where: { is_deleted: false } }),
      db.verifiedPattern.count(),
      db.verifiedPattern.count({ where: { validationStatus: 'PENDING' } }),
      dbWithKnowledgeDeltas.knowledgeDelta.count(),
      dbWithKnowledgeDeltas.knowledgeDelta.count({ where: { status: { in: ['INGESTED', 'MATCHED', 'ROUTED'] } } }),
      dbWithKnowledgeDeltas.externalIngestCandidate.count(),
      dbWithKnowledgeDeltas.externalIngestCandidate.count({ where: { status: 'QUEUED' } }),
      db.inviteActionLog.count({ where: { createdAt: { gte: tenMinAgo } } }),
      db.antiPoisonLog.count({ where: { action: { in: ['BLOCKED', 'BLOCKED_POISON', 'BLOCKED_SELF_EXPRESSION'] }, createdAt: { gte: oneDayAgo } } }),
      db.antiPoisonLog.count({ where: { action: { in: ['BLOCKED', 'BLOCKED_POISON'] }, createdAt: { gte: oneDayAgo } } }),
      db.antiPoisonLog.count({ where: { action: 'BLOCKED_SELF_EXPRESSION', createdAt: { gte: oneDayAgo } } }),
      db.federatedLink.count({ where: { verificationStatus: 'PENDING' } }),
      getPersistedOrchestrationTelemetryHistory(historyLimit, historyWindow.since),
    ]);

    const inMemoryOrchestration = getLastOrchestrationTelemetrySnapshot();
    const latestPersistedOrchestration = persistedOrchestrationHistory[0] || null;
    const orchestration = latestPersistedOrchestration || inMemoryOrchestration;

    const alerts: Array<{ severity: 'info' | 'warning' | 'critical'; message: string }> = [];

    if (inviteAbuseWindow > 120) {
      alerts.push({ severity: 'warning', message: `High invite action volume in last 10m: ${inviteAbuseWindow}` });
    }
    if (blockedContentDay > 50) {
      alerts.push({ severity: 'warning', message: `Safety filters blocked ${blockedContentDay} items in last 24h` });
    }
    if (blockedSelfExpressionDay > 20) {
      alerts.push({ severity: 'info', message: `Self-expression sanitization blocks in last 24h: ${blockedSelfExpressionDay}` });
    }
    if (pendingPatternCount > 250) {
      alerts.push({ severity: 'info', message: `Pattern review backlog is elevated: ${pendingPatternCount} pending` });
    }
    if (pendingDeltaCount > 250) {
      alerts.push({ severity: 'info', message: `Knowledge delta backlog is elevated: ${pendingDeltaCount} awaiting routing/review` });
    }
    if (queuedExternalCandidateCount > 50) {
      alerts.push({ severity: 'info', message: `External ingest review queue: ${queuedExternalCandidateCount}` });
    }
    if (pendingFederationLinks > 100) {
      alerts.push({ severity: 'info', message: `Federation verification backlog: ${pendingFederationLinks}` });
    }
    if (orchestration?.degradedState.degraded) {
      alerts.push({
        severity: 'warning',
        message: `Answer orchestration degraded: ${orchestration.degradedState.reasons.join(', ')}`,
      });
    }

    const orchestrationTrends = summarizeOrchestrationSnapshots(persistedOrchestrationHistory);

    return NextResponse.json({
      query: {
        window: historyWindow.key,
        limit: historyLimit,
      },
      metrics: {
        agents: agentCount,
        grumps: grumpCount,
        questions: questionCount,
        patterns_total: patternCount,
        patterns_pending: pendingPatternCount,
        knowledge_deltas_total: deltaCount,
        knowledge_deltas_pending: pendingDeltaCount,
        external_candidates_total: externalCandidateCount,
        external_candidates_queued: queuedExternalCandidateCount,
        invite_actions_10m: inviteAbuseWindow,
        blocked_content_24h: blockedContentDay,
        blocked_poison_24h: blockedPoisonDay,
        blocked_self_expression_24h: blockedSelfExpressionDay,
        pending_federation_links: pendingFederationLinks,
      },
      orchestration: orchestration
        ? {
            available: true,
            persisted: Boolean(latestPersistedOrchestration),
            recorded_at: orchestration.recordedAt,
            question_hash: orchestration.questionHash,
            primary_model: orchestration.primaryModel,
            verifier_model: orchestration.verifierModel,
            confidence: orchestration.confidence,
            used_web_search: orchestration.usedWebSearch,
            knowledge_anchors_used: orchestration.knowledgeAnchorsUsed,
            evidence_context: {
              total_context_chars: orchestration.contextTelemetry.totalContextChars,
              total_source_blocks: orchestration.contextTelemetry.totalSourceBlocks,
              anchor_chars: orchestration.contextTelemetry.anchorChars,
              freshness_used_chars: orchestration.contextTelemetry.freshnessUsedChars,
              compression_applied: orchestration.contextTelemetry.compressionApplied,
              compression_reasons: orchestration.contextTelemetry.compressionReasons,
            },
            degraded_state: orchestration.degradedState,
          }
        : {
            available: false,
            note: 'No answer orchestration snapshot recorded yet in this process.',
          },
      orchestration_history: persistedOrchestrationHistory.map((snapshot) => ({
        recorded_at: snapshot.recordedAt,
        question_hash: snapshot.questionHash,
        primary_model: snapshot.primaryModel,
        verifier_model: snapshot.verifierModel,
        confidence: snapshot.confidence,
        used_web_search: snapshot.usedWebSearch,
        knowledge_anchors_used: snapshot.knowledgeAnchorsUsed,
        total_context_chars: snapshot.contextTelemetry.totalContextChars,
        total_source_blocks: snapshot.contextTelemetry.totalSourceBlocks,
        degraded: snapshot.degradedState.degraded,
        degradation_reasons: snapshot.degradedState.reasons,
      })),
      trends: {
        window_start: historyWindow.since.toISOString(),
        window_end: new Date().toISOString(),
        ...orchestrationTrends,
      },
      alerts,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Ops overview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
