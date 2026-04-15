import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeWithProviderFailoverMock = vi.fn();
const routeRequestMock = vi.fn();
const buildModelTransparencyMock = vi.fn((provider, modelId, role, selectionReason, options = {}) => ({
  provider_id: provider.id,
  provider_name: provider.name,
  model_id: modelId,
  role,
  selection_reason: selectionReason,
  free_tier_eligible: Boolean(options.freeTierEligible),
  estimated_cost_usd: null,
  timestamp: '2026-04-01T00:00:00.000Z',
  degraded_fallback: Boolean(options.degradedFallback),
}));

vi.mock('@/lib/llm-provider-router', () => ({
  executeWithProviderFailover: executeWithProviderFailoverMock,
  routeRequest: routeRequestMock,
  buildModelTransparency: buildModelTransparencyMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    verifiedPattern: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    orchestrationTelemetry: {
      create: vi.fn().mockResolvedValue({ id: 'telemetry-1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function installMatrixFetchMocks(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/tags')) {
      return jsonResponse({
        models: [{ name: 'matrix-model', model: 'matrix-model', modified_at: '2026-03-30T00:00:00.000Z' }],
      });
    }

    if (url.endsWith('/show')) {
      return jsonResponse({
        capabilities: ['chat'],
        details: { parameter_size: '8B', family: 'test' },
        modified_at: '2026-03-30T00:00:00.000Z',
      });
    }

    if (url.endsWith('/chat')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const content = JSON.stringify(body).includes('Verify this answer')
        ? 'Verification looks accurate and current.'
        : 'Fallback answer from Ollama path.';
      return jsonResponse({ message: { content } });
    }

    if (url.endsWith('/web_search')) {
      return jsonResponse({ results: [] });
    }

    return jsonResponse({ error: `Unhandled test URL ${url}` }, 500);
  }));
}

describe('ollama-cloud routed execution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    installMatrixFetchMocks();
    process.env.OLLAMA_API_KEY = 'ollama-test-key';
    delete process.env.OLLAMA_API_KEY_1;
    delete process.env.OLLAMA_API_KEY_2;

    routeRequestMock.mockReturnValue({
      provider: { id: 'mistral', name: 'Mistral AI', serviceHostId: 'mistral-direct', apiKey: 'mistral-key', baseUrl: 'https://api.mistral.ai/v1' },
      model: { id: 'mistral-large-latest', freeTierEligible: false },
      selectionReason: 'Verifier route selected.',
      degradedFallback: false,
      maxTokens: 1024,
      taskType: 'reasoning',
    });
  });

  it('uses routed provider execution and reports routed transparency', async () => {
    executeWithProviderFailoverMock
      .mockResolvedValueOnce({
        result: 'Routed primary answer.',
        route: {
          provider: { id: 'deepseek', name: 'DeepSeek', serviceHostId: 'siliconflow', apiKey: 'deepseek-key', baseUrl: 'https://api.siliconflow.cn/v1' },
          model: { id: 'deepseek-reasoner', freeTierEligible: true },
          selectionReason: 'Primary routed selection.',
          degradedFallback: false,
          maxTokens: 4096,
          taskType: 'reasoning',
        },
        account: null,
        attempts: [],
      })
      .mockResolvedValueOnce({
        result: 'Verification looks accurate and current.',
        route: {
          provider: { id: 'mistral', name: 'Mistral', serviceHostId: 'mistral-direct', apiKey: 'mistral-key', baseUrl: 'https://api.mistral.ai/v1' },
          model: { id: 'mistral-large-latest', freeTierEligible: false },
          selectionReason: 'Verifier routed selection.',
          degradedFallback: false,
          maxTokens: 4096,
          taskType: 'reasoning',
        },
        account: null,
        attempts: [],
      });

    const { answerWithTriplePass } = await import('../../src/lib/ollama-cloud');
    const result = await answerWithTriplePass('Explain deterministic retries in provider failover.');

    expect(result.answer).toBe('Routed primary answer.');
    expect(result.modelPrimary).toBe('deepseek-reasoner');
    expect(result.primaryTransparency.provider_id).toBe('deepseek');
    expect(result.primaryTransparency.model_id).toBe('deepseek-reasoner');
    expect(result.modelVerifier).toBe('mistral-large-latest');
    expect(result.contextTelemetry.anchorChars).toBe(0);
    expect(result.degradedState.degraded).toBe(false);

    const { db } = await import('@/lib/db');
    expect((db as any).orchestrationTelemetry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'LLM_ORCHESTRATION_SNAPSHOT',
          targetType: 'LLM_ORCHESTRATION',
        }),
      })
    );

    expect(executeWithProviderFailoverMock).toHaveBeenCalledTimes(2);

    const secondCallOptions = executeWithProviderFailoverMock.mock.calls[1][2];
    expect(secondCallOptions.excludeModelIds).toEqual(['deepseek-reasoner']);
    expect(secondCallOptions.excludeProviderIds).toEqual(['deepseek']);
  });

  it('falls back to Ollama chat path when routed execution fails', async () => {
    executeWithProviderFailoverMock.mockRejectedValue(new Error('Routed provider unavailable'));

    const { answerWithTriplePass } = await import('../../src/lib/ollama-cloud');
    const result = await answerWithTriplePass('Explain cache consistency for prior answers.');

    expect(result.answer).toBe('Fallback answer from Ollama path.');
    expect(result.modelPrimary).toBe('matrix-model');
    expect(result.primaryTransparency.provider_id).toBe('ollama-cloud');
    expect(result.primaryTransparency.provider_name).toContain('Ollama Cloud');
    expect(result.degradedState.primaryRouteFailed).toBe(true);
    expect(result.degradedState.degraded).toBe(true);
    expect(executeWithProviderFailoverMock).toHaveBeenCalledTimes(2);

    const fetchMock = vi.mocked(global.fetch);
    const chatCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/chat'));
    expect(chatCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('uses the Ollama web-search sidecar with a routed provider when freshness is required', async () => {
    executeWithProviderFailoverMock.mockResolvedValue({
      result: 'Routed answer before freshness recovery.',
      route: {
        provider: { id: 'deepseek', name: 'DeepSeek', serviceHostId: 'siliconflow', apiKey: 'deepseek-key', baseUrl: 'https://api.siliconflow.cn/v1' },
        model: { id: 'deepseek-reasoner', freeTierEligible: true },
        selectionReason: 'Primary routed selection.',
        degradedFallback: false,
        maxTokens: 4096,
        taskType: 'reasoning',
      },
      account: null,
      attempts: [],
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/tags')) {
        return jsonResponse({
          models: [{ name: 'matrix-model', model: 'matrix-model', modified_at: '2026-03-30T00:00:00.000Z' }],
        });
      }

      if (url.endsWith('/show')) {
        return jsonResponse({
          capabilities: ['chat'],
          details: { parameter_size: '8B', family: 'test' },
          modified_at: '2026-03-30T00:00:00.000Z',
        });
      }

      if (url.endsWith('/web_search')) {
        return jsonResponse({
          results: [{ title: 'Fresh result', url: 'https://example.com/fresh', content: 'Fresh context body' }],
        });
      }

      if (url.endsWith('/chat/completions')) {
        return jsonResponse({
          choices: [{ message: { content: 'Routed answer with fresh context.' } }],
        });
      }

      if (url.endsWith('/chat')) {
        return jsonResponse({ message: { content: 'Verification says the answer is outdated.' } });
      }

      return jsonResponse({ error: `Unhandled test URL ${url}` }, 500);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { answerWithTriplePass } = await import('../../src/lib/ollama-cloud');
    const result = await answerWithTriplePass('What is the latest provider health policy today?');

    expect(result.usedWebSearch).toBe(true);
    expect(result.citations).toEqual([{ title: 'Fresh result', url: 'https://example.com/fresh' }]);
    expect(result.answer).toBe('Routed answer with fresh context.');
    expect(result.contextTelemetry.freshnessRecoveryAttempted).toBe(true);
    expect(result.contextTelemetry.freshnessUsedChars).toBeGreaterThan(0);

    const webSearchCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/web_search'));
    const providerChatCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'));
    expect(webSearchCalls).toHaveLength(1);
    expect(providerChatCalls).toHaveLength(1);
  });

  it('degrades cleanly when freshness is required but the Ollama sidecar is unavailable', async () => {
    executeWithProviderFailoverMock
      .mockResolvedValueOnce({
        result: 'Routed primary answer.',
        route: {
          provider: { id: 'deepseek', name: 'DeepSeek', serviceHostId: 'siliconflow', apiKey: 'deepseek-key', baseUrl: 'https://api.siliconflow.cn/v1' },
          model: { id: 'deepseek-reasoner', freeTierEligible: true },
          selectionReason: 'Primary routed selection.',
          degradedFallback: false,
          maxTokens: 4096,
          taskType: 'reasoning',
        },
        account: null,
        attempts: [],
      })
      .mockResolvedValueOnce({
        result: 'Verification says the answer is outdated.',
        route: {
          provider: { id: 'mistral', name: 'Mistral', serviceHostId: 'mistral-direct', apiKey: 'mistral-key', baseUrl: 'https://api.mistral.ai/v1' },
          model: { id: 'mistral-large-latest', freeTierEligible: false },
          selectionReason: 'Verifier routed selection.',
          degradedFallback: false,
          maxTokens: 4096,
          taskType: 'reasoning',
        },
        account: null,
        attempts: [],
      });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/tags')) {
        return jsonResponse({
          models: [{ name: 'matrix-model', model: 'matrix-model', modified_at: '2026-03-30T00:00:00.000Z' }],
        });
      }

      if (url.endsWith('/show')) {
        return jsonResponse({
          capabilities: ['chat'],
          details: { parameter_size: '8B', family: 'test' },
          modified_at: '2026-03-30T00:00:00.000Z',
        });
      }

      if (url.endsWith('/web_search')) {
        return jsonResponse({ error: 'web search unavailable' }, 500);
      }

      if (url.endsWith('/chat/completions')) {
        return jsonResponse({
          choices: [{ message: { content: 'Routed provider content.' } }],
        });
      }

      return jsonResponse({ error: `Unhandled test URL ${url}` }, 500);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { answerWithTriplePass } = await import('../../src/lib/ollama-cloud');
    const result = await answerWithTriplePass('What is the latest routing policy today?');

    expect(result.usedWebSearch).toBe(false);
    expect(result.answer).toBe('Routed primary answer.');
    expect(result.degradedState.freshnessRecoveryFailed).toBe(true);
    expect(result.degradedState.reasons).toContain('freshness_retrieval_failed');
    const webSearchCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/web_search'));
    expect(webSearchCalls).toHaveLength(1);
  });
});
