import { describe, expect, it, vi } from 'vitest';

const getLastOrchestrationTelemetrySnapshotMock = vi.fn();

vi.mock('@/lib/ollama-cloud', () => ({
  getLastOrchestrationTelemetrySnapshot: getLastOrchestrationTelemetrySnapshotMock,
}));

describe('AgentSelfAwareness orchestration telemetry', () => {
  it('includes orchestration truth signals in the self-awareness report', async () => {
    getLastOrchestrationTelemetrySnapshotMock.mockReturnValue({
      recordedAt: '2026-04-01T00:00:00.000Z',
      questionHash: 'abc123def4567890',
      primaryModel: 'deepseek-reasoner',
      verifierModel: 'mistral-large-latest',
      confidence: 0.82,
      usedWebSearch: false,
      knowledgeAnchorsUsed: 2,
      contextTelemetry: {
        freshnessBudgetChars: 4000,
        freshnessUsedChars: 0,
        freshnessSourcesUsed: 0,
        freshnessRecoveryRequested: false,
        freshnessRecoveryAttempted: false,
        anchorChars: 850,
        anchorContextCapped: false,
        consistencyHintChars: 0,
        consistencyHintsUsed: 0,
        totalContextChars: 850,
        totalSourceBlocks: 2,
        compressionApplied: false,
        compressionReasons: [],
      },
      degradedState: {
        degraded: false,
        reasons: [],
        freshnessRecoveryFailed: false,
        primaryRouteFailed: false,
        verifierRouteFailed: false,
        verifierReusedPrimaryModel: false,
      },
    });

    const { createAgentSelfAwareness } = await import('../../src/lib/agents/self-awareness');
    const report = createAgentSelfAwareness('agent-1').generateSelfAwarenessReport();

    expect(report.answerOrchestration.telemetryAvailable).toBe(true);
    expect(report.answerOrchestration.totalContextChars).toBe(850);
    expect(report.answerOrchestration.knowledgeAnchorsUsed).toBe(2);
    expect(report.answerOrchestration.degraded).toBe(false);
  });
});