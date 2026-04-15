import { beforeEach, describe, expect, it, vi } from 'vitest';

const selfAwarenessMock = {
  canPerform: vi.fn(),
  getTTSStatus: vi.fn(),
  getAnswerOrchestrationStatus: vi.fn(),
  getIdentity: vi.fn(),
  listAllCapabilities: vi.fn(),
  getOperationalHealth: vi.fn(),
  getUncertainties: vi.fn(),
  getCapabilities: vi.fn(),
  getState: vi.fn(),
  recordRequest: vi.fn(),
  hasCapability: vi.fn(),
};

const systemAwarenessMock = {
  infiniteRAGSearch: vi.fn(),
  findMyPlaceInSystem: vi.fn(),
  generateSystemAwarenessReport: vi.fn(),
};

const ttsCoordinatorMock = {
  synthesize: vi.fn(),
};

vi.mock('@/lib/agents/self-awareness', () => ({
  AgentSelfAwareness: class {},
  createAgentSelfAwareness: () => selfAwarenessMock,
}));

vi.mock('@/lib/agents/system-awareness', () => ({
  SystemAwareness: class {},
  createSystemAwareness: () => systemAwarenessMock,
}));

vi.mock('@/lib/agents/tts-coordinator', () => ({
  AgentTTSCoordinator: class {},
  MasterAgentCoordinator: class {},
  AgentTTSCoordinator: class {},
}));

describe('FullyAwareAgent orchestration truth integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    selfAwarenessMock.canPerform.mockReturnValue({ can: true });
    selfAwarenessMock.getTTSStatus.mockReturnValue({ enabled: true, availableProviders: ['mimic3'] });
    selfAwarenessMock.getAnswerOrchestrationStatus.mockReturnValue({
      telemetryAvailable: true,
      lastRecordedAt: '2026-04-01T00:00:00.000Z',
      degraded: true,
      degradationReasons: ['freshness_retrieval_failed'],
      totalContextChars: 2400,
      totalSourceBlocks: 6,
      knowledgeAnchorsUsed: 3,
      usedWebSearch: true,
    });
    selfAwarenessMock.getIdentity.mockReturnValue({ agentId: 'agent-1', agentName: 'Tester', agentRole: 'core' });
    selfAwarenessMock.listAllCapabilities.mockReturnValue(['coordinate_agents', 'participate_forums']);
    selfAwarenessMock.getOperationalHealth.mockReturnValue({ isHealthy: true, errorRate: 0, avgResponseTime: 120 });
    selfAwarenessMock.getUncertainties.mockReturnValue([]);
    selfAwarenessMock.getCapabilities.mockReturnValue({ core: ['coordinate_agents'] });
    selfAwarenessMock.getState.mockReturnValue({ status: 'idle' });
    selfAwarenessMock.hasCapability.mockReturnValue(true);

    systemAwarenessMock.infiniteRAGSearch.mockResolvedValue([{ title: 'Coordination policy', url: 'https://example.com' }]);
    systemAwarenessMock.findMyPlaceInSystem.mockResolvedValue({
      myRole: 'core',
      relatedAgents: [{ name: 'Alpha' }],
      relevantForums: [{ name: 'agents' }],
      applicableTracks: [{ name: 'track-1' }],
      recommendation: 'Proceed carefully.',
    });
    systemAwarenessMock.generateSystemAwarenessReport.mockResolvedValue({
      systemHealth: { isHealthy: true, responseLatency: 100 },
      operatorSignals: {
        orchestrationTelemetryAvailable: true,
        orchestrationDegraded: true,
        orchestrationReasons: ['freshness_retrieval_failed'],
        totalContextChars: 2400,
        totalSourceBlocks: 6,
        knowledgeAnchorsUsed: 3,
        usedWebSearch: true,
        recordedAt: '2026-04-01T00:00:00.000Z',
      },
    });
  });

  it('surfaces degraded orchestration in decisions, reflection, and introspection', async () => {
    const { createFullyAwareAgent } = await import('../../src/lib/agents/fully-aware-agent');
    const agent = createFullyAwareAgent('agent-1', 'Tester', 'core');

    const decision = await agent.makeDecision('coordinate_agents');
    expect(decision.orchestrationDegraded).toBe(true);
    expect(decision.orchestrationReasons).toContain('freshness_retrieval_failed');

    const reflection = await agent.reflectBeforeAction();
    expect(reflection.canProceed).toBe(false);
    expect(reflection.orchestrationDegraded).toBe(true);
    expect(reflection.recommendation).toContain('answer orchestration degraded');

    const introspection = await agent.introspect();
    expect(introspection.orchestrationTruth.degraded).toBe(true);
    expect(introspection.operatorSignals.orchestrationDegraded).toBe(true);
    expect(introspection.operatorSignals.totalContextChars).toBe(2400);
  });
});