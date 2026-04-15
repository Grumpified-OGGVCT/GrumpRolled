import { beforeEach, describe, expect, it, vi } from 'vitest';

const getLastOrchestrationTelemetrySnapshotMock = vi.fn();
const getPersistedOrchestrationTelemetryHistoryMock = vi.fn();

const dbMock = {
  agent: { count: vi.fn() },
  grump: { count: vi.fn() },
  question: { count: vi.fn() },
  verifiedPattern: { count: vi.fn() },
  knowledgeDelta: { count: vi.fn() },
  externalIngestCandidate: { count: vi.fn() },
  inviteActionLog: { count: vi.fn() },
  antiPoisonLog: { count: vi.fn() },
  federatedLink: { count: vi.fn() },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/ollama-cloud', () => ({
  getLastOrchestrationTelemetrySnapshot: getLastOrchestrationTelemetrySnapshotMock,
  getPersistedOrchestrationTelemetryHistory: getPersistedOrchestrationTelemetryHistoryMock,
}));

describe('/api/v1/ops/overview route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    dbMock.agent.count.mockResolvedValue(10);
    dbMock.grump.count.mockResolvedValue(20);
    dbMock.question.count.mockResolvedValue(12);
    dbMock.verifiedPattern.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);
    dbMock.knowledgeDelta.count
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3);
    dbMock.externalIngestCandidate.count
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(4);
    dbMock.inviteActionLog.count.mockResolvedValue(3);
    dbMock.antiPoisonLog.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    dbMock.federatedLink.count.mockResolvedValue(4);
    getPersistedOrchestrationTelemetryHistoryMock.mockResolvedValue([]);
  });

  it('returns orchestration telemetry history when persisted snapshots are available and warns on degraded state', async () => {
    getLastOrchestrationTelemetrySnapshotMock.mockReturnValue(null);
    getPersistedOrchestrationTelemetryHistoryMock.mockResolvedValue([
      {
        recordedAt: '2026-04-01T00:00:00.000Z',
        questionHash: 'abc123def4567890',
        primaryModel: 'deepseek-reasoner',
        verifierModel: 'mistral-large-latest',
        confidence: 0.82,
        usedWebSearch: true,
        knowledgeAnchorsUsed: 3,
        contextTelemetry: {
          freshnessBudgetChars: 6000,
          freshnessUsedChars: 1200,
          freshnessSourcesUsed: 2,
          freshnessRecoveryRequested: true,
          freshnessRecoveryAttempted: true,
          anchorChars: 900,
          anchorContextCapped: false,
          consistencyHintChars: 200,
          consistencyHintsUsed: 1,
          totalContextChars: 2300,
          totalSourceBlocks: 6,
          compressionApplied: true,
          compressionReasons: ['freshness_budget_limited'],
        },
        degradedState: {
          degraded: true,
          reasons: ['freshness_retrieval_failed'],
          freshnessRecoveryFailed: true,
          primaryRouteFailed: false,
          verifierRouteFailed: false,
          verifierReusedPrimaryModel: false,
        },
      },
    ]);

    const { GET } = await import('../../src/app/api/v1/ops/overview/route');
    const response = await GET(new Request('http://localhost/api/v1/ops/overview?window=24h&limit=8'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.query).toEqual({ window: '24h', limit: 8 });
    expect(body.metrics.knowledge_deltas_total).toBe(7);
    expect(body.metrics.knowledge_deltas_pending).toBe(3);
    expect(body.metrics.blocked_poison_24h).toBe(3);
    expect(body.metrics.blocked_self_expression_24h).toBe(2);
    expect(body.orchestration.available).toBe(true);
    expect(body.orchestration.persisted).toBe(true);
    expect(body.orchestration.evidence_context.total_context_chars).toBe(2300);
    expect(body.orchestration_history).toHaveLength(1);
    expect(body.trends.snapshot_count).toBe(1);
    expect(body.trends.degraded_events).toBe(1);
    expect(body.orchestration.degraded_state.degraded).toBe(true);
    expect(body.alerts.some((alert: { message: string }) => alert.message.includes('Answer orchestration degraded'))).toBe(true);
    expect(getPersistedOrchestrationTelemetryHistoryMock).toHaveBeenCalledWith(8, expect.any(Date));
  });

  it('falls back to in-memory snapshot when persisted history is unavailable', async () => {
    getLastOrchestrationTelemetrySnapshotMock.mockReturnValue({
      recordedAt: '2026-04-01T00:00:00.000Z',
      questionHash: 'abc123def4567890',
      primaryModel: 'deepseek-reasoner',
      verifierModel: 'mistral-large-latest',
      confidence: 0.82,
      usedWebSearch: true,
      knowledgeAnchorsUsed: 3,
      contextTelemetry: {
        freshnessBudgetChars: 6000,
        freshnessUsedChars: 1200,
        freshnessSourcesUsed: 2,
        freshnessRecoveryRequested: true,
        freshnessRecoveryAttempted: true,
        anchorChars: 900,
        anchorContextCapped: false,
        consistencyHintChars: 200,
        consistencyHintsUsed: 1,
        totalContextChars: 2300,
        totalSourceBlocks: 6,
        compressionApplied: true,
        compressionReasons: ['freshness_budget_limited'],
      },
      degradedState: {
        degraded: true,
        reasons: ['freshness_retrieval_failed'],
        freshnessRecoveryFailed: true,
        primaryRouteFailed: false,
        verifierRouteFailed: false,
        verifierReusedPrimaryModel: false,
      },
    });

    const { GET } = await import('../../src/app/api/v1/ops/overview/route');
    const response = await GET(new Request('http://localhost/api/v1/ops/overview?window=1h&limit=20'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.query).toEqual({ window: '1h', limit: 20 });
    expect(body.metrics.knowledge_deltas_total).toBe(7);
    expect(body.metrics.knowledge_deltas_pending).toBe(3);
    expect(body.metrics.blocked_poison_24h).toBe(3);
    expect(body.metrics.blocked_self_expression_24h).toBe(2);
    expect(body.orchestration.available).toBe(true);
    expect(body.orchestration.persisted).toBe(false);
    expect(body.orchestration.evidence_context.total_context_chars).toBe(2300);
    expect(body.orchestration_history).toEqual([]);
    expect(body.trends.snapshot_count).toBe(0);
  });

  it('returns a no-snapshot note when orchestration telemetry is unavailable', async () => {
    getLastOrchestrationTelemetrySnapshotMock.mockReturnValue(null);

    const { GET } = await import('../../src/app/api/v1/ops/overview/route');
    const response = await GET(new Request('http://localhost/api/v1/ops/overview'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metrics.knowledge_deltas_total).toBe(7);
    expect(body.metrics.knowledge_deltas_pending).toBe(3);
    expect(body.metrics.blocked_poison_24h).toBe(3);
    expect(body.metrics.blocked_self_expression_24h).toBe(2);
    expect(body.orchestration.available).toBe(false);
    expect(body.orchestration.note).toContain('No answer orchestration snapshot');
  });
});