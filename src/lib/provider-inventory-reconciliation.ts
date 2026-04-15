import {
  getProviderInventory,
  listProviderAccountEnvCandidates,
  type ProviderId,
  type ProviderInventoryEntry,
} from './llm-provider-router';

export type ReconciledProviderStatus = 'routed-active' | 'routed-inactive' | 'cataloged-unsupported';
export type ReconciliationSource = 'router' | 'ollama-sidecar';

export interface ReconciledProviderEntry {
  inventory_key: string;
  provider_name: string;
  status: ReconciledProviderStatus;
  source: ReconciliationSource;
  configured: boolean;
  configured_account_count: number;
  configured_env_names: string[];
  candidate_env_names: string[];
  routed_provider_id?: ProviderId;
  approval_required: boolean;
  notes: string[];
}

export interface ProviderInventoryReconciliationSnapshot {
  reconciled_at: string;
  routed_inventory: ProviderInventoryEntry[];
  broader_inventory: ReconciledProviderEntry[];
  approval_required: ReconciledProviderEntry[];
  mismatch_warnings: string[];
}

const OLLAMA_SIDECAR_CANDIDATE_ENV_NAMES = ['OLLAMA_API_KEY_1', 'OLLAMA_API_KEY_2', 'OLLAMA_API_KEY'];

function splitEnvKeys(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listConfiguredEnvNames(envNames: string[], env: NodeJS.ProcessEnv): string[] {
  return envNames.filter((envName) => {
    const value = env[envName];
    return Boolean(value && value.trim());
  });
}

function countUniqueConfiguredSecrets(envNames: string[], env: NodeJS.ProcessEnv): number {
  const values = envNames.flatMap((envName) => splitEnvKeys(env[envName]));
  return new Set(values).size;
}

function buildRoutedEntry(entry: ProviderInventoryEntry): ReconciledProviderEntry {
  const usesSingleKeyConfigSemantics =
    entry.configured &&
    entry.configured_account_count === 1 &&
    entry.configured_env_names.length === 1 &&
    !entry.configured_env_names[0]?.endsWith('_API_KEYS');

  const notes: string[] = [];
  if (entry.uses_fallback_config_account || usesSingleKeyConfigSemantics) {
    notes.push('Using fallback config-account semantics instead of explicit multi-account env values.');
  }

  return {
    inventory_key: entry.provider_id,
    provider_name: entry.provider_name,
    status: entry.configured ? 'routed-active' : 'routed-inactive',
    source: 'router',
    configured: entry.configured,
    configured_account_count: entry.configured_account_count,
    configured_env_names: [...entry.configured_env_names],
    candidate_env_names: [...entry.candidate_env_names],
    routed_provider_id: entry.provider_id,
    approval_required: false,
    notes,
  };
}

function buildOllamaSidecarEntry(env: NodeJS.ProcessEnv): ReconciledProviderEntry | null {
  const configuredEnvNames = listConfiguredEnvNames(OLLAMA_SIDECAR_CANDIDATE_ENV_NAMES, env);
  const configuredAccountCount = countUniqueConfiguredSecrets(OLLAMA_SIDECAR_CANDIDATE_ENV_NAMES, env);

  if (configuredAccountCount === 0) {
    return null;
  }

  return {
    inventory_key: 'ollama-sidecar',
    provider_name: 'Ollama Cloud Sidecar',
    status: 'cataloged-unsupported',
    source: 'ollama-sidecar',
    configured: true,
    configured_account_count: configuredAccountCount,
    configured_env_names: configuredEnvNames,
    candidate_env_names: [...OLLAMA_SIDECAR_CANDIDATE_ENV_NAMES],
    approval_required: true,
    notes: [
      'Configured for sidecar/runtime fallback work, not part of the routed provider union.',
      'Cataloged only until explicit router-level approval or adapter expansion exists.',
    ],
  };
}

export function reconcileProviderInventory(env: NodeJS.ProcessEnv = process.env): ProviderInventoryReconciliationSnapshot {
  const routedInventory = getProviderInventory();
  const broaderInventory: ReconciledProviderEntry[] = routedInventory.map(buildRoutedEntry);
  const mismatchWarnings: string[] = [];

  for (const routedEntry of routedInventory) {
    const currentConfiguredEnvNames = listConfiguredEnvNames(listProviderAccountEnvCandidates(routedEntry.provider_id), env);
    if (currentConfiguredEnvNames.length !== routedEntry.configured_env_names.length) {
      mismatchWarnings.push(
        `Provider ${routedEntry.provider_id} env-name reconciliation differs between router snapshot and live env scan.`,
      );
    }
  }

  const ollamaSidecarEntry = buildOllamaSidecarEntry(env);
  if (ollamaSidecarEntry) {
    broaderInventory.push(ollamaSidecarEntry);
  }

  return {
    reconciled_at: new Date().toISOString(),
    routed_inventory: routedInventory,
    broader_inventory: broaderInventory,
    approval_required: broaderInventory.filter((entry) => entry.approval_required),
    mismatch_warnings: [...new Set(mismatchWarnings)],
  };
}
