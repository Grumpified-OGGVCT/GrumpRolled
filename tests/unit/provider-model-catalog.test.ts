import { describe, expect, it } from 'vitest';
import {
  getHostedModelsForFamily,
  getHostedModelsForService,
  getModelFamilyCatalog,
  getServiceHostCatalog,
  MODEL_FAMILY_CATALOG,
  SERVICE_HOST_CATALOG,
} from '../../src/lib/provider-model-catalog';

describe('provider model catalog truth', () => {
  it('separates service host identity from provider family identity', () => {
    expect(SERVICE_HOST_CATALOG['ollama-cloud'].chatApiStyle).toBe('ollama-native');
    expect(SERVICE_HOST_CATALOG.openrouter.chatApiStyle).toBe('openai-compatible');
    expect(SERVICE_HOST_CATALOG['ollama-cloud'].providerFamilyIds).toEqual(['ollama', 'gemma']);
  });

  it('catalogs qwen as known model family truth even before routed support exists', () => {
    expect(MODEL_FAMILY_CATALOG.qwen.routedStatus).toBe('unsupported');
    expect(MODEL_FAMILY_CATALOG.qwen.hostedBy).toContain('openrouter');
    expect(getHostedModelsForFamily('qwen').length).toBeGreaterThan(0);
  });

  it('does not conflate free-tier status source with routed activation', () => {
    const deepseek = MODEL_FAMILY_CATALOG.deepseek;
    const openrouter = MODEL_FAMILY_CATALOG.openrouter;

    expect(deepseek.freeTierStatusSource).toBe('promotional');
    expect(openrouter.freeTierStatusSource).toBe('heuristic');
    expect(deepseek.routedStatus).toBe('active');
  });

  it('exposes service-host and model-family listings for later adapter work', () => {
    expect(getServiceHostCatalog().map((entry) => entry.id)).toContain('siliconflow');
    expect(getModelFamilyCatalog().map((entry) => entry.id)).toContain('qwen');
    expect(getModelFamilyCatalog().map((entry) => entry.id)).toContain('gemma');
    expect(getHostedModelsForService('mistral-direct').map((entry) => entry.modelId)).toContain('mistral-large-latest');
  });

  it('catalogs gemma as Ollama-side truth without marking it as active routed support', () => {
    expect(MODEL_FAMILY_CATALOG.gemma.routedStatus).toBe('approval-required');
    expect(MODEL_FAMILY_CATALOG.gemma.hostedBy).toEqual(['ollama-cloud']);
    expect(getHostedModelsForFamily('gemma').map((entry) => entry.modelId)).toEqual(
      expect.arrayContaining(['gemma4:latest', 'gemma4:e2b', 'gemma4:e4b', 'gemma4:26b', 'gemma4:31b']),
    );
  });
});
