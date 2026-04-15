import { beforeEach, describe, expect, it, vi } from 'vitest';

const healthCheckProvidersMock = vi.fn();

vi.mock('@/lib/llm-provider-router', () => ({
  PROVIDER_CONFIGS: {
    deepseek: { name: 'DeepSeek', allocationPercent: 90, recommended: true },
    mistral: { name: 'Mistral', allocationPercent: 0, recommended: true },
  },
  healthCheckProviders: healthCheckProvidersMock,
}));

describe('/api/v1/provider-health route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns null average latency when no providers report latency', async () => {
    healthCheckProvidersMock.mockResolvedValue({
      deepseek: { online: true },
      mistral: { online: false, error: 'offline' },
    });

    const { GET } = await import('../../src/app/api/v1/provider-health/route');
    const response = await GET({} as never);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.summary.average_latency_ms).toBeNull();
    expect(body.summary.total_providers).toBe(2);
    expect(body.providers[1].error).toBe('offline');
  });
});
