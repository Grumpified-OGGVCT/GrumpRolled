import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCostComparisonMock = vi.fn();
const getPricingMatrixMock = vi.fn();
const routeRequestMock = vi.fn();
const getProviderInventoryMock = vi.fn();

vi.mock('@/lib/llm-provider-router', () => ({
  PROVIDER_CONFIGS: {
    deepseek: {
      name: 'DeepSeek-R1 (SiliconFlow) — PRIMARY',
      allocationPercent: 90,
      pricePerMInput: 0.14,
      pricePerMOutput: 0.28,
      contextWindow: 128000,
      quality: 'A',
      recommended: true,
    },
    mistral: {
      name: 'Mistral AI — STRONG DIRECT PROVIDER',
      allocationPercent: 0,
      pricePerMInput: 0.4,
      pricePerMOutput: 1.2,
      contextWindow: 128000,
      quality: 'A',
      recommended: true,
    },
    groq: {
      name: 'Groq (Free LPU) — FAST POLLING',
      allocationPercent: 5,
      pricePerMInput: 0,
      pricePerMOutput: 0,
      contextWindow: 32000,
      quality: 'B',
      recommended: true,
    },
    openrouter: {
      name: 'OpenRouter (Aggregator) — FALLBACK',
      allocationPercent: 5,
      pricePerMInput: 0.9,
      pricePerMOutput: 0.9,
      contextWindow: 200000,
      quality: 'A',
      recommended: false,
    },
  },
  getCostComparison: getCostComparisonMock,
  getPricingMatrix: getPricingMatrixMock,
  routeRequest: routeRequestMock,
  getProviderInventory: getProviderInventoryMock,
}));

describe('/api/v1/cost-info route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getCostComparisonMock.mockReturnValue({ ollama: 80, hybrid: 35, deepseek: 28, savingsPercent: 56 });
    getPricingMatrixMock.mockImplementation((input: number, output: number) => ({ input, output }));
    routeRequestMock.mockImplementation((taskType: string) => ({ provider: { name: `${taskType}-provider` } }));
    getProviderInventoryMock.mockReturnValue([
      { provider_id: 'deepseek', configured: true },
      { provider_id: 'mistral', configured: false },
      { provider_id: 'groq', configured: true },
      { provider_id: 'openrouter', configured: false },
    ]);
  });

  it('returns dynamic provider strategy and generic action items', async () => {
    const { GET } = await import('../../src/app/api/v1/cost-info/route');
    const response = await GET({} as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.provider_strategy.fallback_cascade).toEqual([
      'DeepSeek-R1 (SiliconFlow) — PRIMARY',
      'Groq (Free LPU) — FAST POLLING',
      'OpenRouter (Aggregator) — FALLBACK',
      'Mistral AI — STRONG DIRECT PROVIDER',
    ]);
    expect(body.provider_strategy.routed_provider_count).toBe(4);
    expect(body.provider_strategy.configured_provider_count).toBe(2);
    expect(body.action_items[0]).toContain('admin inventory surface');
    expect(body.action_items.join(' ')).not.toContain('SILICONFLOW_API_KEY');
    expect(body.total_monthly_spend.new).toBe('Hybrid routed providers: $35');
  });
});
