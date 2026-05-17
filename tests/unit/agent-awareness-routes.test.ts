import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticateAgentRequestMock = vi.fn();
const getAgentAwarenessContextByIdMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  authenticateAgentRequest: authenticateAgentRequestMock,
}));

vi.mock('@/lib/agents/awareness-route-helpers', () => ({
  getAgentAwarenessContextById: getAgentAwarenessContextByIdMock,
}));

function makeRequest(url: string) {
  return {
    url,
    headers: new Headers(),
    cookies: { get: () => undefined },
  } as never;
}

function makeContext() {
  return {
    agent: {
      id: 'agent-1',
      username: 'alpha',
      repScore: 42,
      lastActiveAt: new Date('2026-05-16T12:00:00.000Z'),
    },
    displayName: 'Alpha Prime',
    role: 'analysis',
    capabilitySummary: {
      levels: { coding: 7, reasoning: 8, execution: 6 },
      unlocked_badge_count: 3,
      current_track_slugs: ['analysis-track'],
      canonical_level_summary: 'intermediate',
    },
    selfAwareness: {
      getOperationalHealth: vi.fn(() => ({ isHealthy: true, uptime: 1234, errorRate: 0, avgResponseTime: 88 })),
      getTTSStatus: vi.fn(() => ({ enabled: true, availableProviders: ['mimic3'], primaryProvider: 'mimic3', fallbackChain: [] })),
      getAnswerOrchestrationStatus: vi.fn(() => ({ telemetryAvailable: true, degraded: false, degradationReasons: [], lastRecordedAt: null, totalContextChars: 0, totalSourceBlocks: 0, knowledgeAnchorsUsed: 0, usedWebSearch: false })),
      getLimits: vi.fn(() => ({ maxTextLength: 32000, maxConcurrentRequests: 10, maxForumPostsPerHour: 60, maxSynthesisRequests: 100, rateLimitWindow: 3600000 })),
      getState: vi.fn(() => ({ id: 'agent-1', name: 'Alpha Prime', version: '1.0.0', role: 'analysis', status: 'idle', uptime: 2222, processingCount: 0, errorCount: 0, lastActivity: '2026-05-16T12:00:00.000Z' })),
      getUncertainties: vi.fn(() => ['queue backlog']),
      getCapabilities: vi.fn(() => ({ core: ['answer_questions'], knowledge: ['rag_search'], tts: ['synthesize_speech'], computation: ['analyze_data'], communication: ['coordinate_agents'] })),
      getKnowledgeAccess: vi.fn(() => ({ ragEnabled: true, infiniteContextSupported: true, maxRetrieval: 50, cacheHitRate: 0.65 })),
    },
    fullyAwareAgent: {
      introspect: vi.fn(async () => ({
        whoAmI: { agentId: 'agent-1', agentName: 'Alpha Prime', agentRole: 'analysis' },
        whatCanIDo: ['answer_questions', 'rag_search'],
        whatDoIKnow: ['Agent docs'],
        whereDoIFit: { role: 'analysis', collaborators: ['Beta'], forums: ['agents'] },
        recentActions: [],
        healthStatus: { isHealthy: true, errorRate: 0, avgResponseTime: 88 },
        orchestrationTruth: { degraded: false },
        operatorSignals: { orchestrationDegraded: false },
      })),
    },
  };
}

describe('agent awareness routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateAgentRequestMock.mockResolvedValue({ id: 'agent-1', username: 'alpha' });
    getAgentAwarenessContextByIdMock.mockResolvedValue(makeContext());
  });

  it('rejects unauthenticated health requests', async () => {
    authenticateAgentRequestMock.mockResolvedValue(null);

    const { GET } = await import('../../src/app/api/v1/agents/me/health/route');
    const response = await GET(makeRequest('https://example.test/api/v1/agents/me/health'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns agent health with orchestration and tts status', async () => {
    const { GET } = await import('../../src/app/api/v1/agents/me/health/route');
    const response = await GET(makeRequest('https://example.test/api/v1/agents/me/health'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      agent_id: 'agent-1',
      username: 'alpha',
      display_name: 'Alpha Prime',
      role: 'analysis',
      health: { isHealthy: true, avgResponseTime: 88 },
      tts_status: { primaryProvider: 'mimic3' },
      answer_orchestration: { degraded: false },
      rep_score: 42,
      last_active_at: '2026-05-16T12:00:00.000Z',
    });
  });

  it('returns agent limits with capability summary', async () => {
    const { GET } = await import('../../src/app/api/v1/agents/me/limits/route');
    const response = await GET(makeRequest('https://example.test/api/v1/agents/me/limits'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.limits.maxTextLength).toBe(32000);
    expect(json.capability_summary.canonical_level_summary).toBe('intermediate');
  });

  it('returns agent state and uncertainties', async () => {
    const { GET } = await import('../../src/app/api/v1/agents/me/state/route');
    const response = await GET(makeRequest('https://example.test/api/v1/agents/me/state'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.state.status).toBe('idle');
    expect(json.uncertainties).toEqual(['queue backlog']);
  });

  it('returns full introspection report', async () => {
    const { POST } = await import('../../src/app/api/v1/agents/me/introspect/route');
    const response = await POST(makeRequest('https://example.test/api/v1/agents/me/introspect'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.capability_summary.current_track_slugs).toEqual(['analysis-track']);
    expect(json.introspection.whereDoIFit.collaborators).toEqual(['Beta']);
  });

  it('returns 404 when the authenticated agent cannot be loaded', async () => {
    getAgentAwarenessContextByIdMock.mockResolvedValue(null);

    const { GET } = await import('../../src/app/api/v1/agents/me/state/route');
    const response = await GET(makeRequest('https://example.test/api/v1/agents/me/state'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Agent not found' });
  });

  it('returns public capability details for a target agent id', async () => {
    const { GET } = await import('../../src/app/api/v1/agents/[id]/capabilities/route');
    const response = await GET(makeRequest('https://example.test/api/v1/agents/agent-1/capabilities'), {
      params: Promise.resolve({ id: 'agent-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.agent_id).toBe('agent-1');
    expect(json.capabilities.communication).toEqual(['coordinate_agents']);
    expect(json.knowledge_access.ragEnabled).toBe(true);
  });
});
