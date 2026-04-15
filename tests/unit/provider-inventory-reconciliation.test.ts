import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('provider inventory reconciliation', () => {
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.resetModules();
    envSnapshot = preserveEnv();

    delete process.env.SILICONFLOW_API_KEY;
    delete process.env.SILICONFLOW_API_KEYS;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEYS;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_API_KEYS;
    delete process.env.MISTRAL_AI_API_KEY;
    delete process.env.MISTRAL_AI_API_KEYS;
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEYS;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEYS;
    delete process.env.OLLAMA_API_KEY;
    delete process.env.OLLAMA_API_KEY_1;
    delete process.env.OLLAMA_API_KEY_2;
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it('returns routed providers as inactive when no provider envs are configured', async () => {
    const { reconcileProviderInventory } = await import('../../src/lib/provider-inventory-reconciliation');
    const snapshot = reconcileProviderInventory();

    expect(snapshot.routed_inventory).toHaveLength(4);
    expect(snapshot.broader_inventory).toHaveLength(4);
    expect(snapshot.approval_required).toEqual([]);
    expect(snapshot.broader_inventory.every((entry) => entry.status === 'routed-inactive')).toBe(true);
  });

  it('counts a single routed provider account without exposing values', async () => {
    process.env.SILICONFLOW_API_KEY = 'sk-deepseek-primary';

    const { reconcileProviderInventory } = await import('../../src/lib/provider-inventory-reconciliation');
    const snapshot = reconcileProviderInventory();
    const deepseek = snapshot.broader_inventory.find((entry) => entry.inventory_key === 'deepseek');

    expect(deepseek).toMatchObject({
      configured: true,
      status: 'routed-active',
      configured_account_count: 1,
      configured_env_names: ['SILICONFLOW_API_KEY'],
      approval_required: false,
    });
    expect(JSON.stringify(snapshot)).not.toContain('sk-deepseek-primary');
  });

  it('deduplicates multi-account and duplicate env values for routed providers', async () => {
    process.env.GROQ_API_KEYS = 'gsk-one,gsk-two,gsk-one';
    process.env.GROQ_API_KEY = 'gsk-two';

    const { reconcileProviderInventory } = await import('../../src/lib/provider-inventory-reconciliation');
    const snapshot = reconcileProviderInventory();
    const groq = snapshot.broader_inventory.find((entry) => entry.inventory_key === 'groq');

    expect(groq).toMatchObject({
      configured: true,
      status: 'routed-active',
      configured_account_count: 2,
    });
    expect(groq?.configured_env_names).toEqual(['GROQ_API_KEYS', 'GROQ_API_KEY']);
    expect(JSON.stringify(snapshot)).not.toContain('gsk-one');
    expect(JSON.stringify(snapshot)).not.toContain('gsk-two');
  });

  it('marks fallback config-account semantics when only a single routed config key is present', async () => {
    process.env.MISTRAL_AI_API_KEY = 'mistral-config-key';

    const { reconcileProviderInventory } = await import('../../src/lib/provider-inventory-reconciliation');
    const snapshot = reconcileProviderInventory();
    const mistral = snapshot.broader_inventory.find((entry) => entry.inventory_key === 'mistral');

    expect(mistral?.notes).toContain('Using fallback config-account semantics instead of explicit multi-account env values.');
    expect(mistral?.configured_account_count).toBe(1);
  });

  it('catalogs the Ollama sidecar separately and flags it for approval-required review', async () => {
    process.env.OLLAMA_API_KEY_1 = 'ollama-sidecar-a';
    process.env.OLLAMA_API_KEY_2 = 'ollama-sidecar-b';

    const { reconcileProviderInventory } = await import('../../src/lib/provider-inventory-reconciliation');
    const snapshot = reconcileProviderInventory();
    const ollama = snapshot.broader_inventory.find((entry) => entry.inventory_key === 'ollama-sidecar');

    expect(ollama).toMatchObject({
      status: 'cataloged-unsupported',
      source: 'ollama-sidecar',
      configured: true,
      configured_account_count: 2,
      approval_required: true,
    });
    expect(ollama?.configured_env_names).toEqual(['OLLAMA_API_KEY_1', 'OLLAMA_API_KEY_2']);
    expect(snapshot.approval_required).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toContain('ollama-sidecar-a');
    expect(JSON.stringify(snapshot)).not.toContain('ollama-sidecar-b');
  });
});
