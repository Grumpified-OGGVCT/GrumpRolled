import { beforeEach, describe, expect, it, vi } from 'vitest';

const answerWithTriplePassMock = vi.fn();
const selectBarkMock = vi.fn();
const injectBarkMock = vi.fn();
const routeRequestMock = vi.fn();
const getCostComparisonMock = vi.fn();

vi.mock('@/lib/ollama-cloud', () => ({
  answerWithTriplePass: answerWithTriplePassMock,
}));

vi.mock('@/lib/bark-engine', () => ({
  selectBark: selectBarkMock,
  injectBark: injectBarkMock,
  GRUMPIFIED_SIGNATURE: '\n\n--GRUMP--',
}));

vi.mock('@/lib/llm-provider-router', () => ({
  routeRequest: routeRequestMock,
  getCostComparison: getCostComparisonMock,
}));

describe('/api/v1/llm/answer route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    answerWithTriplePassMock.mockResolvedValue({
      answer: 'Fact-grounded answer.',
      verification: 'Verified.',
      modelPrimary: 'deepseek-reasoner',
      modelVerifier: 'mistral-large-latest',
      modelPrimaryReason: 'Primary reason.',
      modelVerifierReason: 'Verifier reason.',
      selectionSummary: 'Selection summary.',
      primaryTransparency: {
        provider_id: 'deepseek',
        provider_name: 'DeepSeek',
        model_id: 'deepseek-reasoner',
        role: 'primary',
        selection_reason: 'Primary reason.',
        free_tier_eligible: true,
        estimated_cost_usd: null,
        timestamp: '2026-04-01T00:00:00.000Z',
        degraded_fallback: false,
      },
      verifierTransparency: {
        provider_id: 'mistral',
        provider_name: 'Mistral',
        model_id: 'mistral-large-latest',
        role: 'verifier',
        selection_reason: 'Verifier reason.',
        free_tier_eligible: false,
        estimated_cost_usd: null,
        timestamp: '2026-04-01T00:00:00.000Z',
        degraded_fallback: false,
      },
      usedWebSearch: false,
      confidence: 0.82,
      citations: [],
      contextBudgetChars: 4000,
      contextUsedChars: 800,
      contextSourcesUsed: 2,
      knowledgeAnchorsUsed: 0,
      contextTelemetry: {
        freshnessBudgetChars: 4000,
        freshnessUsedChars: 800,
        freshnessSourcesUsed: 2,
        freshnessRecoveryRequested: false,
        freshnessRecoveryAttempted: false,
        anchorChars: 0,
        anchorContextCapped: false,
        consistencyHintChars: 0,
        consistencyHintsUsed: 0,
        totalContextChars: 800,
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
      consistencyKey: 'abc123',
      consistencyCacheHit: false,
    });

    routeRequestMock.mockReturnValue({
      provider: { name: 'Mistral AI' },
      model: { id: 'mistral-large-latest' },
      selectionReason: 'Catalog recommendation.',
    });

    getCostComparisonMock.mockReturnValue({ savingsPercent: 72 });
  });

  it('returns a successful no-bark response with quality and cost metadata', async () => {
    const { POST } = await import('../../src/app/api/v1/llm/answer/route');

    const response = await POST({
      json: async () => ({ question: 'What is deterministic failover?', userId: 'u-1', no_bark: true }),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.answer).toBe('Fact-grounded answer.');
    expect(body.bark_enabled).toBe(false);
    expect(body.cost_info.provider_route).toBe('DeepSeek');
    expect(body.cost_info.route_catalog_recommendation.model).toBe('mistral-large-latest');
    expect(body.evidence_context.total_context_chars).toBe(800);
    expect(body.degraded_state.degraded).toBe(false);
    expect(answerWithTriplePassMock).toHaveBeenCalledWith('What is deterministic failover?');
    expect(selectBarkMock).not.toHaveBeenCalled();
  });
});
