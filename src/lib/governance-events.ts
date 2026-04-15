export type OrchestrationTelemetrySnapshot = {
  recordedAt: string;
  questionHash: string;
  primaryModel: string;
  verifierModel: string;
  confidence: number;
  usedWebSearch: boolean;
  knowledgeAnchorsUsed: number;
  contextTelemetry: {
    freshnessBudgetChars: number;
    freshnessUsedChars: number;
    freshnessSourcesUsed: number;
    freshnessRecoveryRequested: boolean;
    freshnessRecoveryAttempted: boolean;
    anchorChars: number;
    anchorContextCapped: boolean;
    consistencyHintChars: number;
    consistencyHintsUsed: number;
    totalContextChars: number;
    totalSourceBlocks: number;
    compressionApplied: boolean;
    compressionReasons: string[];
  };
  degradedState: {
    degraded: boolean;
    reasons: string[];
    freshnessRecoveryFailed: boolean;
    primaryRouteFailed: boolean;
    verifierRouteFailed: boolean;
    verifierReusedPrimaryModel: boolean;
  };
};

export const ORCHESTRATION_SNAPSHOT_ACTION = 'LLM_ORCHESTRATION_SNAPSHOT';
export const ORCHESTRATION_SNAPSHOT_TARGET = 'LLM_ORCHESTRATION';

export type GovernanceEventEnvelope<TPayload> = {
  version: 'v1';
  actor_type: 'SYSTEM' | 'OWNER' | 'AGENT';
  actor_label: string;
  event_type: 'orchestration_snapshot';
  payload: TPayload;
};

export function createOrchestrationGovernanceMetadata(
  snapshot: OrchestrationTelemetrySnapshot
): string {
  const envelope: GovernanceEventEnvelope<OrchestrationTelemetrySnapshot> = {
    version: 'v1',
    actor_type: 'SYSTEM',
    actor_label: 'answer-orchestration',
    event_type: 'orchestration_snapshot',
    payload: snapshot,
  };

  return JSON.stringify(envelope);
}

export function parseOrchestrationGovernanceMetadata(
  metadata: string | null | undefined
): OrchestrationTelemetrySnapshot | null {
  if (!metadata) return null;

  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const record = parsed as Record<string, unknown>;
    const payload = (record.payload && typeof record.payload === 'object'
      ? record.payload
      : null) as Record<string, unknown> | null;

    if (
      !payload ||
      typeof payload.recordedAt !== 'string' ||
      typeof payload.questionHash !== 'string' ||
      typeof payload.primaryModel !== 'string' ||
      typeof payload.verifierModel !== 'string' ||
      typeof payload.confidence !== 'number' ||
      typeof payload.usedWebSearch !== 'boolean' ||
      typeof payload.knowledgeAnchorsUsed !== 'number'
    ) {
      return null;
    }

    return payload as unknown as OrchestrationTelemetrySnapshot;
  } catch {
    return null;
  }
}

export const WINDOW_TO_MS: Record<string, number> = {
  '10m': 10 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function parseWindowParam(windowValue: string | null, fallback: keyof typeof WINDOW_TO_MS): {
  key: keyof typeof WINDOW_TO_MS;
  since: Date;
} {
  const key = (windowValue && windowValue in WINDOW_TO_MS ? windowValue : fallback) as keyof typeof WINDOW_TO_MS;
  return {
    key,
    since: new Date(Date.now() - WINDOW_TO_MS[key]),
  };
}

export function parseLimitParam(value: string | null, fallback: number, min = 1, max = 100): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function summarizeOrchestrationSnapshots(snapshots: OrchestrationTelemetrySnapshot[]) {
  const snapshotCount = snapshots.length;
  const degradedEvents = snapshots.filter((snapshot) => snapshot.degradedState.degraded).length;
  const webSearchEvents = snapshots.filter((snapshot) => snapshot.usedWebSearch).length;
  const avgConfidence =
    snapshotCount > 0
      ? snapshots.reduce((total, snapshot) => total + snapshot.confidence, 0) / snapshotCount
      : 0;
  const avgContextChars =
    snapshotCount > 0
      ? snapshots.reduce((total, snapshot) => total + snapshot.contextTelemetry.totalContextChars, 0) / snapshotCount
      : 0;

  return {
    snapshot_count: snapshotCount,
    degraded_events: degradedEvents,
    healthy_events: snapshotCount - degradedEvents,
    avg_confidence: Number(avgConfidence.toFixed(4)),
    avg_context_chars: Math.round(avgContextChars),
    web_search_pct: snapshotCount > 0 ? Number((webSearchEvents / snapshotCount).toFixed(4)) : 0,
    degradation_rate: snapshotCount > 0 ? Number((degradedEvents / snapshotCount).toFixed(4)) : 0,
  };
}