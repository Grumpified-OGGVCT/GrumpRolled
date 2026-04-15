import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inferProviderFamilyForHostedModel } from '../../src/lib/provider-model-catalog';

function preserveEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

function restoreEnv(snapshot: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value;
  }
}

describe('llm provider router discovery truth', () => {
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    envSnapshot = preserveEnv();
    process.env.SILICONFLOW_API_KEY = 'siliconflow-test-key';
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    vi.unstubAllGlobals();
  });

  it('keeps discovered qwen models cataloged as unsupported on siliconflow instead of making them routable by default', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/models')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'Qwen/QwQ-32B' },
              { id: 'deepseek-reasoner' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ error: `Unhandled URL ${url}` }), { status: 500 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const { refreshProviderModelPool, getModelsForProvider } = await import('../../src/lib/llm-provider-router');
    await refreshProviderModelPool('deepseek', true);
    const models = getModelsForProvider('deepseek');
    const qwenEntry = models.find((entry) => entry.id === 'Qwen/QwQ-32B');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/models$/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer siliconflow-test-key' }),
      }),
    );
    expect(qwenEntry).toMatchObject({
      id: 'Qwen/QwQ-32B',
      providerId: 'deepseek',
      serviceHostId: 'siliconflow',
      providerFamilyId: 'qwen',
      freeTierEligible: false,
      freeTierStatusSource: 'unknown',
      roles: [],
    });
    expect(qwenEntry?.notes).toContain('Routed status: unsupported.');
  });

  it('infers gemma as an Ollama-hosted family without implying routed activation', () => {
    expect(inferProviderFamilyForHostedModel('ollama-cloud', 'gemma4:26b')).toBe('gemma');
    expect(inferProviderFamilyForHostedModel('ollama-cloud', 'gemma4:e2b')).toBe('gemma');
  });
});
