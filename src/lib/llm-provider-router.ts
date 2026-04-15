/**
 * GRUMPROLLED COST-OPTIMIZED LLM ROUTER
 *
 * This module is a provider and model catalog for routing decisions,
 * operational health, and user-facing transparency metadata.
 *
 * Important boundary:
 * - This file selects preferred provider/model routes.
 * - It does not itself generate answers.
 * - Runtime-specific generators such as ollama-cloud.ts can import these
 *   types and helpers to keep provenance payloads stable.
 */

import { retryable } from '@/lib/retry-helper';
import { getProviderServiceAdapter } from '@/lib/provider-service-adapters';
import {
  findHostedModelEntry,
  inferProviderFamilyForHostedModel,
  MODEL_FAMILY_CATALOG,
  type ProviderFamilyId,
  type ServiceHostId,
} from '@/lib/provider-model-catalog';

export type ProviderId = 'deepseek' | 'mistral' | 'groq' | 'openrouter';
export type TaskType = 'reasoning' | 'fast-polling' | 'cost-optimized' | 'long-context';
export type ModelRole = TaskType | 'verifier' | 'resident-queue' | 'presence-draft';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  serviceHostId: ServiceHostId;
  providerFamilyId: ProviderFamilyId;
  apiKey?: string;
  baseUrl: string;
  rateLimitPerMinute: number;
  contextWindow: number;
  pricePerMInput: number;
  pricePerMOutput: number;
  quality: 'S' | 'A' | 'B';
  recommended: boolean;
  allocationPercent: number;
  freeTierAvailable: boolean;
  freeTierNotes?: string;
  healthPath: string;
  cooldownMs: number;
}

export interface ProviderAccountConfig {
  id: string;
  providerId: ProviderId;
  apiKey: string;
  label: string;
}

export interface ProviderExecutionAttempt {
  provider_id: ProviderId;
  provider_name: string;
  model_id: string;
  account_id: string | null;
  success: boolean;
  error?: string;
}

export interface ProviderExecutionResult<T> {
  result: T;
  route: LLMRoute;
  account: ProviderAccountConfig | null;
  attempts: ProviderExecutionAttempt[];
}

export interface ModelCatalogEntry {
  id: string;
  label: string;
  providerId: ProviderId;
  serviceHostId: ServiceHostId;
  providerFamilyId: ProviderFamilyId;
  contextWindow: number;
  maxTokens: number;
  quality: 'S' | 'A' | 'B';
  roles: ModelRole[];
  freeTierEligible: boolean;
  freeTierStatusSource: 'authoritative' | 'promotional' | 'heuristic' | 'unknown';
  priority: number;
  notes?: string;
}

export interface RouteSelectionOptions {
  requiredContextWindow?: number;
  preferFreeTier?: boolean;
  excludeProviderIds?: ProviderId[];
  excludeModelIds?: string[];
}

export interface ProviderExecutionOptions extends RouteSelectionOptions {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMRoute {
  taskType: TaskType;
  provider: ProviderConfig;
  model: ModelCatalogEntry;
  maxTokens: number;
  selectionReason: string;
  degradedFallback: boolean;
}

export interface ProviderHealthResult {
  online: boolean;
  latencyMs?: number;
  error?: string;
  configuredAccounts?: number;
  usableAccounts?: number;
}

export interface ModelTransparencyRecord {
  provider_id: string;
  provider_name: string;
  model_id: string;
  role: string;
  selection_reason: string;
  free_tier_eligible: boolean;
  estimated_cost_usd: number | null;
  timestamp: string;
  degraded_fallback: boolean;
}

export interface ProviderIdentityLike {
  id: string;
  name: string;
  pricePerMInput: number;
  pricePerMOutput: number;
  freeTierAvailable: boolean;
}

type ProviderHealthState = ProviderHealthResult & {
  checkedAt: number;
  cooldownUntil: number;
  freeInputUsed?: number;
  freeOutputUsed?: number;
  freeInputCap?: number;
  freeOutputCap?: number;
  quotaExhausted?: boolean;
};

type ProviderAccountHealthState = ProviderHealthResult & {
  checkedAt: number;
  cooldownUntil: number;
  lastUsedAt: number;
  authFailed?: boolean;
  quotaExhausted?: boolean;
  freeInputUsed?: number;
  freeOutputUsed?: number;
  freeInputCap?: number;
  freeOutputCap?: number;
};

type ProviderModelPoolState = {
  checkedAt: number;
  discoveredModelIds: string[];
  discoveredEntries: Record<string, ModelCatalogEntry>;
};

export interface ProviderModelPoolSnapshot {
  provider_id: ProviderId;
  checked_at: string | null;
  discovered_model_count: number;
  models: ModelCatalogEntry[];
}

export type ProviderAdapterStatus = 'supported-active' | 'supported-inactive';

export interface ProviderInventoryEntry {
  provider_id: ProviderId;
  provider_name: string;
  adapter_status: ProviderAdapterStatus;
  configured: boolean;
  configured_account_count: number;
  uses_fallback_config_account: boolean;
  configured_env_names: string[];
  candidate_env_names: string[];
  static_model_count: number;
  discovered_model_count: number;
  base_url: string;
  health_path: string;
  supports_chat_completions: boolean;
  supports_model_discovery: boolean;
  supports_multi_account: boolean;
  recommended: boolean;
  allocation_percent: number;
  free_tier_available: boolean;
}

const QUALITY_SCORE: Record<'S' | 'A' | 'B', number> = {
  S: 30,
  A: 20,
  B: 10,
};

const MODEL_DISCOVERY_TTL_MS = 1000 * 60 * 10;
const PROVIDER_ACCOUNT_ENV_LIMIT = 8;

const PROVIDER_PRIORITY_ORDER: ProviderId[] = ['deepseek', 'mistral', 'groq', 'openrouter'];

export const PROVIDER_CONFIGS: Record<ProviderId, ProviderConfig> = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek-R1 (SiliconFlow) — PRIMARY',
    serviceHostId: 'siliconflow',
    providerFamilyId: 'deepseek',
    apiKey: process.env.SILICONFLOW_API_KEY || process.env.DEEPSEEK_API_KEY,
    baseUrl: 'https://api.siliconflow.cn/v1',
    rateLimitPerMinute: 60,
    contextWindow: 128000,
    pricePerMInput: 0.14,
    pricePerMOutput: 0.28,
    quality: 'A',
    recommended: true,
    allocationPercent: 90,
    freeTierAvailable: true,
    freeTierNotes: 'Free/promotional quota may exist depending on account state.',
    healthPath: '/models',
    cooldownMs: 5 * 60 * 1000,
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI — STRONG DIRECT PROVIDER',
    serviceHostId: 'mistral-direct',
    providerFamilyId: 'mistral',
    apiKey: process.env.MISTRAL_API_KEY || process.env.MISTRAL_AI_API_KEY,
    baseUrl: 'https://api.mistral.ai/v1',
    rateLimitPerMinute: 60,
    contextWindow: 128000,
    pricePerMInput: 0.4,
    pricePerMOutput: 1.2,
    quality: 'A',
    recommended: true,
    allocationPercent: 0,
    freeTierAvailable: false,
    freeTierNotes: 'Direct Mistral lane for strong reasoning and verification; not treated as free-tier.',
    healthPath: '/models',
    cooldownMs: 5 * 60 * 1000,
  },
  groq: {
    id: 'groq',
    name: 'Groq (Free LPU) — FAST POLLING',
    serviceHostId: 'groq-openai',
    providerFamilyId: 'groq',
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: 'https://api.groq.com/openai/v1',
    rateLimitPerMinute: 30,
    contextWindow: 32000,
    pricePerMInput: 0.0,
    pricePerMOutput: 0.0,
    quality: 'B',
    recommended: true,
    allocationPercent: 5,
    freeTierAvailable: true,
    freeTierNotes: 'Free-tier rate limits apply.',
    healthPath: '/models',
    cooldownMs: 5 * 60 * 1000,
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter (Aggregator) — FALLBACK',
    serviceHostId: 'openrouter',
    providerFamilyId: 'openrouter',
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: 'https://openrouter.ai/api/v1',
    rateLimitPerMinute: 100,
    contextWindow: 200000,
    pricePerMInput: 0.9,
    pricePerMOutput: 0.9,
    quality: 'A',
    recommended: false,
    allocationPercent: 5,
    freeTierAvailable: true,
    freeTierNotes: 'Some catalog models may be free-tier eligible depending on account and model state.',
    healthPath: '/models',
    cooldownMs: 5 * 60 * 1000,
  },
};

export const MODEL_CATALOG: Record<string, ModelCatalogEntry> = {
  'deepseek-reasoner': {
    id: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner',
    providerId: 'deepseek',
    serviceHostId: 'siliconflow',
    providerFamilyId: 'deepseek',
    contextWindow: 128000,
    maxTokens: 4096,
    quality: 'A',
    roles: ['reasoning', 'cost-optimized', 'resident-queue', 'verifier'],
    freeTierEligible: true,
    freeTierStatusSource: 'promotional',
    priority: 95,
    notes: 'Best default reasoning lane when cheap high-capability answers are acceptable.',
  },
  'deepseek-coder-v1.5': {
    id: 'deepseek-coder-v1.5',
    label: 'DeepSeek Coder v1.5',
    providerId: 'deepseek',
    serviceHostId: 'siliconflow',
    providerFamilyId: 'deepseek',
    contextWindow: 128000,
    maxTokens: 3072,
    quality: 'A',
    roles: ['cost-optimized', 'resident-queue', 'presence-draft'],
    freeTierEligible: true,
    freeTierStatusSource: 'promotional',
    priority: 82,
    notes: 'Useful cheap fallback for coding-heavy drafting when premium routing is unnecessary.',
  },
  'mixtral-8x7b-32768': {
    id: 'mixtral-8x7b-32768',
    label: 'Mixtral 8x7B 32K',
    providerId: 'groq',
    serviceHostId: 'groq-openai',
    providerFamilyId: 'mistral',
    contextWindow: 32000,
    maxTokens: 2048,
    quality: 'B',
    roles: ['fast-polling', 'cost-optimized', 'resident-queue', 'presence-draft'],
    freeTierEligible: true,
    freeTierStatusSource: 'authoritative',
    priority: 88,
    notes: 'Fastest free lane for queue triage and lightweight operational responses.',
  },
  'mistral-large-latest': {
    id: 'mistral-large-latest',
    label: 'Mistral Large Latest',
    providerId: 'mistral',
    serviceHostId: 'mistral-direct',
    providerFamilyId: 'mistral',
    contextWindow: 128000,
    maxTokens: 8192,
    quality: 'A',
    roles: ['reasoning', 'long-context', 'verifier'],
    freeTierEligible: false,
    freeTierStatusSource: 'authoritative',
    priority: 97,
    notes: 'Direct premium Mistral lane for strongest reasoning and verification when available.',
  },
  'mistral-medium-latest': {
    id: 'mistral-medium-latest',
    label: 'Mistral Medium Latest',
    providerId: 'mistral',
    serviceHostId: 'mistral-direct',
    providerFamilyId: 'mistral',
    contextWindow: 128000,
    maxTokens: 6144,
    quality: 'A',
    roles: ['reasoning', 'verifier', 'resident-queue'],
    freeTierEligible: false,
    freeTierStatusSource: 'authoritative',
    priority: 90,
    notes: 'Balanced direct Mistral lane for strong general reasoning and review.',
  },
  'mistral-small-latest': {
    id: 'mistral-small-latest',
    label: 'Mistral Small Latest',
    providerId: 'mistral',
    serviceHostId: 'mistral-direct',
    providerFamilyId: 'mistral',
    contextWindow: 32000,
    maxTokens: 4096,
    quality: 'B',
    roles: ['cost-optimized', 'resident-queue', 'presence-draft'],
    freeTierEligible: false,
    freeTierStatusSource: 'authoritative',
    priority: 76,
    notes: 'Smaller direct Mistral lane for lower-stakes drafting and queue work.',
  },
  'ministral-8b-latest': {
    id: 'ministral-8b-latest',
    label: 'Ministral 8B Latest',
    providerId: 'mistral',
    serviceHostId: 'mistral-direct',
    providerFamilyId: 'mistral',
    contextWindow: 32000,
    maxTokens: 4096,
    quality: 'B',
    roles: ['cost-optimized', 'presence-draft', 'resident-queue'],
    freeTierEligible: false,
    freeTierStatusSource: 'authoritative',
    priority: 72,
    notes: 'Compact Mistral-family lane for lightweight generation when direct Mistral availability matters.',
  },
  'meta-llama/llama-3.1-405b-instruct': {
    id: 'meta-llama/llama-3.1-405b-instruct',
    label: 'Llama 3.1 405B Instruct',
    providerId: 'openrouter',
    serviceHostId: 'openrouter',
    providerFamilyId: 'meta-llama',
    contextWindow: 200000,
    maxTokens: 8192,
    quality: 'A',
    roles: ['long-context', 'verifier'],
    freeTierEligible: false,
    freeTierStatusSource: 'authoritative',
    priority: 92,
    notes: 'High-context fallback lane when the answer genuinely needs more room.',
  },
  'meta-llama/llama-3.1-8b-instruct': {
    id: 'meta-llama/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B Instruct',
    providerId: 'openrouter',
    serviceHostId: 'openrouter',
    providerFamilyId: 'meta-llama',
    contextWindow: 128000,
    maxTokens: 4096,
    quality: 'B',
    roles: ['cost-optimized', 'presence-draft', 'resident-queue'],
    freeTierEligible: true,
    freeTierStatusSource: 'heuristic',
    priority: 70,
    notes: 'Free-lane OpenRouter fallback for lower-stakes generation.',
  },
};

const providerHealthState: Partial<Record<ProviderId, ProviderHealthState>> = {};
const providerModelPoolState: Partial<Record<ProviderId, ProviderModelPoolState>> = {};
const providerAccountState: Record<string, ProviderAccountHealthState> = {};

function splitEnvKeys(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getProviderAccountEnvCandidates(providerId: ProviderId): string[] {
  switch (providerId) {
    case 'deepseek': {
      return [
        'SILICONFLOW_API_KEYS',
        ...Array.from({ length: PROVIDER_ACCOUNT_ENV_LIMIT }, (_, index) => `SILICONFLOW_API_KEY_${index + 1}`),
        'SILICONFLOW_API_KEY',
        'DEEPSEEK_API_KEYS',
        ...Array.from({ length: PROVIDER_ACCOUNT_ENV_LIMIT }, (_, index) => `DEEPSEEK_API_KEY_${index + 1}`),
        'DEEPSEEK_API_KEY',
      ];
    }
    case 'mistral': {
      return [
        'MISTRAL_API_KEYS',
        ...Array.from({ length: PROVIDER_ACCOUNT_ENV_LIMIT }, (_, index) => `MISTRAL_API_KEY_${index + 1}`),
        'MISTRAL_API_KEY',
        'MISTRAL_AI_API_KEYS',
        ...Array.from({ length: PROVIDER_ACCOUNT_ENV_LIMIT }, (_, index) => `MISTRAL_AI_API_KEY_${index + 1}`),
        'MISTRAL_AI_API_KEY',
      ];
    }
    case 'groq': {
      return [
        'GROQ_API_KEYS',
        ...Array.from({ length: PROVIDER_ACCOUNT_ENV_LIMIT }, (_, index) => `GROQ_API_KEY_${index + 1}`),
        'GROQ_API_KEY',
      ];
    }
    case 'openrouter': {
      return [
        'OPENROUTER_API_KEYS',
        ...Array.from({ length: PROVIDER_ACCOUNT_ENV_LIMIT }, (_, index) => `OPENROUTER_API_KEY_${index + 1}`),
        'OPENROUTER_API_KEY',
      ];
    }
  }
}

export function listProviderAccountEnvCandidates(providerId: ProviderId): string[] {
  return [...getProviderAccountEnvCandidates(providerId)];
}

export function listConfiguredProviderEnvNames(providerId: ProviderId): string[] {
  return getProviderAccountEnvCandidates(providerId).filter((envName) => {
    const value = process.env[envName];
    return Boolean(value && value.trim());
  });
}

export function getProviderAccounts(providerId: ProviderId): ProviderAccountConfig[] {
  const values = getProviderAccountEnvCandidates(providerId)
    .flatMap((envName) => splitEnvKeys(process.env[envName]))
    .filter(Boolean);

  const uniqueKeys = [...new Set(values)];

  return uniqueKeys.map((apiKey, index) => ({
    id: `${providerId}-account-${index + 1}`,
    providerId,
    apiKey,
    label: `${PROVIDER_CONFIGS[providerId].name} account ${index + 1}`,
  }));
}

function getOrCreateProviderAccountState(account: ProviderAccountConfig): ProviderAccountHealthState {
  const existing = providerAccountState[account.id];
  if (existing) return existing;

  const created: ProviderAccountHealthState = {
    online: true,
    checkedAt: 0,
    cooldownUntil: 0,
    lastUsedAt: 0,
    authFailed: false,
    quotaExhausted: false,
    freeInputUsed: 0,
    freeOutputUsed: 0,
  };

  providerAccountState[account.id] = created;
  return created;
}

function initializeDefaultAccountQuotaCaps(account: ProviderAccountConfig): void {
  const state = getOrCreateProviderAccountState(account);
  if (state.freeInputCap !== undefined || state.freeOutputCap !== undefined) {
    return;
  }

  switch (account.providerId) {
    case 'deepseek':
      state.freeInputCap = 5_000_000;
      break;
    case 'mistral':
      break;
    case 'groq':
      state.freeInputCap = Number.POSITIVE_INFINITY;
      break;
    case 'openrouter':
      state.freeInputCap = 1_000_000;
      break;
    default:
      break;
  }
}

function providerAccountQuotaExceeded(account: ProviderAccountConfig): boolean {
  const state = providerAccountState[account.id];
  if (!state) return false;
  if (state.quotaExhausted) return true;
  if (state.freeInputCap !== undefined && (state.freeInputUsed || 0) >= state.freeInputCap) return true;
  if (state.freeOutputCap !== undefined && (state.freeOutputUsed || 0) >= state.freeOutputCap) return true;
  return false;
}

function isProviderAccountSelectable(account: ProviderAccountConfig): boolean {
  const state = providerAccountState[account.id];
  if (!state) return true;
  if (state.authFailed) return false;
  if (state.quotaExhausted) return Date.now() >= state.cooldownUntil;
  if (state.online) return true;
  return Date.now() >= state.cooldownUntil;
}

export function getPreferredProviderAccount(providerId: ProviderId): ProviderAccountConfig | null {
  const accounts = getProviderAccounts(providerId);
  if (accounts.length === 0) return null;

  const ranked = [...accounts].sort((left, right) => {
    const leftState = providerAccountState[left.id];
    const rightState = providerAccountState[right.id];
    const leftSelectable = isProviderAccountSelectable(left) ? 1 : 0;
    const rightSelectable = isProviderAccountSelectable(right) ? 1 : 0;
    if (leftSelectable !== rightSelectable) return rightSelectable - leftSelectable;

    const leftUsed = leftState?.lastUsedAt || 0;
    const rightUsed = rightState?.lastUsedAt || 0;
    return leftUsed - rightUsed;
  });

  return ranked[0] || null;
}

function buildFallbackConfigAccount(providerId: ProviderId): ProviderAccountConfig | null {
  const provider = PROVIDER_CONFIGS[providerId];
  if (!provider.apiKey) return null;

  return {
    id: `${providerId}-config`,
    providerId,
    apiKey: provider.apiKey,
    label: `${provider.name} config account`,
  };
}

function getProviderExecutionAccounts(providerId: ProviderId): ProviderAccountConfig[] {
  const accounts = getProviderAccounts(providerId);
  if (accounts.length > 0) return accounts;

  const fallback = buildFallbackConfigAccount(providerId);
  return fallback ? [fallback] : [];
}

function classifyProviderFailure(error: unknown): {
  message: string;
  authFailed: boolean;
  quotaExhausted: boolean;
} {
  const message = error instanceof Error ? error.message : String(error);
  return {
    message,
    authFailed: /401|403|unauthorized|forbidden|invalid api key|authentication/i.test(message),
    quotaExhausted: /quota\s+exceeded|rate.?limit|429|too many requests/i.test(message),
  };
}

function getOrCreateProviderHealthState(providerId: ProviderId): ProviderHealthState {
  const existing = providerHealthState[providerId];
  if (existing) return existing;

  const created: ProviderHealthState = {
    online: true,
    checkedAt: 0,
    cooldownUntil: 0,
    freeInputUsed: 0,
    freeOutputUsed: 0,
    quotaExhausted: false,
  };

  providerHealthState[providerId] = created;
  return created;
}

function providerFreeQuotaExceeded(providerId: ProviderId): boolean {
  const accounts = getProviderAccounts(providerId);
  if (accounts.length > 0) {
    return accounts.every((account) => providerAccountQuotaExceeded(account));
  }

  const state = providerHealthState[providerId];
  if (!state) return false;
  if (state.quotaExhausted) return true;
  if (state.freeInputCap !== undefined && (state.freeInputUsed || 0) >= state.freeInputCap) return true;
  if (state.freeOutputCap !== undefined && (state.freeOutputUsed || 0) >= state.freeOutputCap) return true;
  return false;
}

function initializeDefaultQuotaCaps(providerId: ProviderId): void {
  const state = getOrCreateProviderHealthState(providerId);
  if (state.freeInputCap !== undefined || state.freeOutputCap !== undefined) {
    return;
  }

  switch (providerId) {
    case 'deepseek':
      state.freeInputCap = 5_000_000;
      break;
    case 'mistral':
      break;
    case 'groq':
      state.freeInputCap = Number.POSITIVE_INFINITY;
      break;
    case 'openrouter':
      state.freeInputCap = 1_000_000;
      break;
    default:
      break;
  }
}

export function setProviderFreeQuotaCaps(
  providerId: ProviderId,
  caps: { freeInputCap?: number; freeOutputCap?: number },
): void {
  const state = getOrCreateProviderHealthState(providerId);
  state.freeInputCap = caps.freeInputCap;
  state.freeOutputCap = caps.freeOutputCap;
  state.quotaExhausted = providerFreeQuotaExceeded(providerId);
}

export function recordProviderUsage(
  providerId: ProviderId,
  usage: { inputTokens: number; outputTokens: number; freeTierEligible?: boolean },
): void {
  if (!usage.freeTierEligible) return;

  initializeDefaultQuotaCaps(providerId);
  const state = getOrCreateProviderHealthState(providerId);
  state.freeInputUsed = (state.freeInputUsed || 0) + usage.inputTokens;
  state.freeOutputUsed = (state.freeOutputUsed || 0) + usage.outputTokens;
  state.quotaExhausted = providerFreeQuotaExceeded(providerId);

  if (state.quotaExhausted) {
    state.online = false;
    state.cooldownUntil = Date.now() + PROVIDER_CONFIGS[providerId].cooldownMs;
  }
}

export function recordProviderAccountUsage(
  account: ProviderAccountConfig,
  usage: { inputTokens: number; outputTokens: number; freeTierEligible?: boolean },
): void {
  if (!usage.freeTierEligible) return;

  initializeDefaultAccountQuotaCaps(account);
  const state = getOrCreateProviderAccountState(account);
  state.freeInputUsed = (state.freeInputUsed || 0) + usage.inputTokens;
  state.freeOutputUsed = (state.freeOutputUsed || 0) + usage.outputTokens;
  state.quotaExhausted = providerAccountQuotaExceeded(account);
  state.lastUsedAt = Date.now();

  if (state.quotaExhausted) {
    state.online = false;
    state.cooldownUntil = Date.now() + PROVIDER_CONFIGS[account.providerId].cooldownMs;
  }
}

export function markProviderQuotaExhausted(providerId: ProviderId, error?: string): void {
  const state = getOrCreateProviderHealthState(providerId);
  state.quotaExhausted = true;
  state.online = false;
  state.error = error || 'Free-tier quota exhausted';
  state.checkedAt = Date.now();
  state.cooldownUntil = Date.now() + PROVIDER_CONFIGS[providerId].cooldownMs;
}

export function markProviderAccountUnavailable(
  account: ProviderAccountConfig,
  options: { error?: string; authFailed?: boolean; quotaExhausted?: boolean } = {},
): void {
  const state = getOrCreateProviderAccountState(account);
  state.online = false;
  state.error = options.error;
  state.authFailed = Boolean(options.authFailed);
  state.quotaExhausted = Boolean(options.quotaExhausted);
  state.checkedAt = Date.now();
  state.cooldownUntil = Date.now() + PROVIDER_CONFIGS[account.providerId].cooldownMs;

  if (options.quotaExhausted) {
    markProviderQuotaExhausted(account.providerId, options.error);
  }
}

export function markProviderAccountHealthy(account: ProviderAccountConfig): void {
  const state = getOrCreateProviderAccountState(account);
  state.online = true;
  state.error = undefined;
  state.authFailed = false;
  state.checkedAt = Date.now();
  state.cooldownUntil = 0;
  state.lastUsedAt = Date.now();
}

export function resetProviderFreeUsage(providerId?: ProviderId): void {
  const providerIds = providerId ? [providerId] : PROVIDER_PRIORITY_ORDER;

  for (const id of providerIds) {
    const state = getOrCreateProviderHealthState(id);
    state.freeInputUsed = 0;
    state.freeOutputUsed = 0;
    state.quotaExhausted = false;
    state.cooldownUntil = 0;
    state.online = true;
    state.error = undefined;
  }
}

export function getProviderRuntimeState(providerId: ProviderId): ProviderHealthState | null {
  const state = providerHealthState[providerId];
  return state ? { ...state } : null;
}

export function getProviderById(providerId: ProviderId): ProviderConfig {
  return PROVIDER_CONFIGS[providerId];
}

export function getModelById(modelId: string): ModelCatalogEntry | null {
  return MODEL_CATALOG[modelId] || null;
}

export function getModelsForProvider(providerId: ProviderId): ModelCatalogEntry[] {
  const staticModels = Object.values(MODEL_CATALOG).filter((model) => model.providerId === providerId);
  const dynamicModels = Object.values(providerModelPoolState[providerId]?.discoveredEntries || {});

  return [...staticModels, ...dynamicModels]
    .filter((model, index, all) => all.findIndex((candidate) => candidate.id === model.id) === index)
    .sort((a, b) => b.priority - a.priority);
}

function humanizeModelLabel(modelId: string): string {
  const leaf = modelId.split('/').pop() || modelId;
  return leaf
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferContextWindow(provider: ProviderConfig, modelId: string): number {
  const explicitK = modelId.match(/(\d+)k/i);
  if (explicitK) {
    return Number(explicitK[1]) * 1000;
  }

  const explicitFiveDigits = modelId.match(/(32768|65536|128000|200000)/);
  if (explicitFiveDigits) {
    return Number(explicitFiveDigits[1]);
  }

  return provider.contextWindow;
}

function inferQuality(modelId: string): 'S' | 'A' | 'B' {
  if (/(405b|70b|reasoner|r1|sonnet|opus|large)/i.test(modelId)) return 'A';
  if (/(8x7b|8b|7b|haiku|mini|small)/i.test(modelId)) return 'B';
  return 'B';
}

function inferFreeTierEligibility(providerId: ProviderId, modelId: string): boolean {
  if (providerId === 'groq') return true;
  if (providerId === 'deepseek') return true;
  if (providerId === 'openrouter') {
    return /(8b|haiku|free|open-mistral|mistral\/open-mistral)/i.test(modelId);
  }

  return false;
}

function inferFreeTierEligibilityFromCatalog(provider: ProviderConfig, modelId: string): {
  freeTierEligible: boolean;
  source: 'authoritative' | 'promotional' | 'heuristic' | 'unknown';
} {
  const exactEntry = findHostedModelEntry(provider.serviceHostId, modelId);
  if (exactEntry) {
    return {
      freeTierEligible: Boolean(exactEntry.freeTierEligible),
      source: exactEntry.freeTierStatusSource,
    };
  }

  const inferredFamily = inferProviderFamilyForHostedModel(provider.serviceHostId, modelId);
  if (inferredFamily) {
    const family = MODEL_FAMILY_CATALOG[inferredFamily];
    if (family.freeTierStatusSource === 'authoritative' || family.freeTierStatusSource === 'unknown') {
      return {
        freeTierEligible: false,
        source: family.freeTierStatusSource,
      };
    }

    return {
      freeTierEligible: inferFreeTierEligibility(provider.id, modelId),
      source: family.freeTierStatusSource,
    };
  }

  return {
    freeTierEligible: inferFreeTierEligibility(provider.id, modelId),
    source: 'heuristic',
  };
}

function inferRoles(providerId: ProviderId, modelId: string, contextWindow: number): ModelRole[] {
  const roles = new Set<ModelRole>(['cost-optimized', 'resident-queue', 'presence-draft']);

  if (providerId === 'groq') {
    roles.add('fast-polling');
  }

  if (/(reasoner|r1|coder|mistral|claude|70b|405b|sonnet)/i.test(modelId) || providerId === 'deepseek') {
    roles.add('reasoning');
    roles.add('verifier');
  }

  if (contextWindow >= 120000 && /(llama|claude|mistral|reasoner|r1|70b|405b)/i.test(modelId)) {
    roles.add('long-context');
  }

  return [...roles];
}

function inferPriority(providerId: ProviderId, quality: 'S' | 'A' | 'B', roles: ModelRole[], freeTierEligible: boolean): number {
  let priority = QUALITY_SCORE[quality] + (freeTierEligible ? 12 : 0);
  if (roles.includes('reasoning')) priority += 18;
  if (roles.includes('verifier')) priority += 8;
  if (roles.includes('fast-polling')) priority += 6;
  if (providerId === 'deepseek') priority += 10;
  if (providerId === 'groq') priority += 6;
  return priority;
}

function inferDynamicModelEntry(providerId: ProviderId, modelId: string): ModelCatalogEntry {
  const provider = PROVIDER_CONFIGS[providerId];
  const exactEntry = findHostedModelEntry(provider.serviceHostId, modelId);
  const inferredFamily = inferProviderFamilyForHostedModel(provider.serviceHostId, modelId);
  const familyCatalog = inferredFamily ? MODEL_FAMILY_CATALOG[inferredFamily] : null;
  const contextWindow = inferContextWindow(provider, modelId);
  const quality = inferQuality(modelId);
  const freeTier = inferFreeTierEligibilityFromCatalog(provider, modelId);
  const routedStatus = exactEntry?.routedStatus || familyCatalog?.routedStatus || 'approval-required';
  const roles = routedStatus === 'active' ? inferRoles(providerId, modelId, contextWindow) : [];

  return {
    id: modelId,
    label: exactEntry?.label || humanizeModelLabel(modelId),
    providerId,
    serviceHostId: provider.serviceHostId,
    providerFamilyId: exactEntry?.providerFamilyId || inferredFamily || provider.providerFamilyId,
    contextWindow,
    maxTokens: Math.min(8192, Math.max(1024, Math.floor(contextWindow / 8))),
    quality,
    roles,
    freeTierEligible: freeTier.freeTierEligible,
    freeTierStatusSource: exactEntry?.freeTierStatusSource || familyCatalog?.freeTierStatusSource || freeTier.source,
    priority: inferPriority(providerId, quality, roles, freeTier.freeTierEligible),
    notes: [
      exactEntry
        ? `Catalog-backed hosted model entry from ${provider.serviceHostId}.`
        : inferredFamily
          ? `Family inferred as ${inferredFamily} on ${provider.serviceHostId}.`
          : `Model family unresolved on ${provider.serviceHostId}; using heuristic fallback.`,
      `Routed status: ${routedStatus}.`,
      `Free-tier source: ${exactEntry?.freeTierStatusSource || familyCatalog?.freeTierStatusSource || freeTier.source}.`,
    ].join(' '),
  };
}

function isModelCurrentlySelectable(model: ModelCatalogEntry): boolean {
  const state = providerModelPoolState[model.providerId];
  if (!state || state.discoveredModelIds.length === 0) {
    return true;
  }

  return state.discoveredModelIds.includes(model.id);
}

function shouldRefreshProviderModelPool(providerId: ProviderId): boolean {
  const state = providerModelPoolState[providerId];
  if (!state) return true;
  return Date.now() - state.checkedAt > MODEL_DISCOVERY_TTL_MS;
}

export async function refreshProviderModelPool(
  providerId: ProviderId,
  force = false,
): Promise<ModelCatalogEntry[]> {
  if (!force && !shouldRefreshProviderModelPool(providerId)) {
    return getModelsForProvider(providerId);
  }

  const config = PROVIDER_CONFIGS[providerId];
  const adapter = getProviderServiceAdapter(config.serviceHostId);
  const accounts = getProviderAccounts(providerId);
  const fallbackAccount = config.apiKey
    ? [{ id: `${providerId}-config`, providerId, apiKey: config.apiKey, label: `${config.name} config account` } satisfies ProviderAccountConfig]
    : [];
  const candidates = accounts.length > 0 ? accounts : fallbackAccount;

  if (candidates.length === 0) {
    throw new Error(`No configured accounts for provider ${providerId}`);
  }

  let response: Response | null = null;
  let lastError: Error | null = null;

  for (const account of candidates) {
    if (!isProviderAccountSelectable(account)) continue;

    try {
      response = await retryable(
        async () => {
          const res = await fetch(`${config.baseUrl}${adapter.modelDiscoveryPath}`, {
            headers: {
              Authorization: `Bearer ${account.apiKey}`,
            },
            signal: AbortSignal.timeout(5000),
          });

          if (!res.ok) {
            const error = new Error(`Model discovery failed for ${providerId}: ${res.status} ${res.statusText}`) as Error & {
              status?: number;
            };
            error.status = res.status;
            throw error;
          }

          return res;
        },
        {
          maxAttempts: 3,
          baseDelayMs: 250,
          onRetry: (attempt, error) => {
            console.warn(`Model discovery retry ${attempt} for ${providerId}/${account.id}: ${error instanceof Error ? error.message : String(error)}`);
          },
        },
      );

      markProviderAccountHealthy(account);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const message = lastError.message;
      markProviderAccountUnavailable(account, {
        error: message,
        authFailed: /401|403|unauthorized|forbidden/i.test(message),
        quotaExhausted: /quota\s+exceeded|rate.?limit|429/i.test(message),
      });
    }
  }

  if (!response) {
    throw lastError || new Error(`Model discovery failed for ${providerId}`);
  }

  const payload = (await response.json()) as unknown;
  const discoveredModelIds = [...new Set(adapter.parseModelDiscoveryResponse(payload))];
  const discoveredEntries = Object.fromEntries(
    discoveredModelIds
      .filter((modelId) => !MODEL_CATALOG[modelId])
      .map((modelId) => [modelId, inferDynamicModelEntry(providerId, modelId)]),
  ) as Record<string, ModelCatalogEntry>;

  providerModelPoolState[providerId] = {
    checkedAt: Date.now(),
    discoveredModelIds,
    discoveredEntries,
  };

  return getModelsForProvider(providerId);
}

export async function refreshAllProviderModelPools(force = false): Promise<Record<ProviderId, ModelCatalogEntry[]>> {
  const refreshed = {} as Record<ProviderId, ModelCatalogEntry[]>;

  for (const providerId of PROVIDER_PRIORITY_ORDER) {
    try {
      refreshed[providerId] = await refreshProviderModelPool(providerId, force);
    } catch {
      refreshed[providerId] = getModelsForProvider(providerId);
    }
  }

  return refreshed;
}

export function getProviderModelPoolSnapshot(providerId: ProviderId): ProviderModelPoolSnapshot {
  const state = providerModelPoolState[providerId];
  return {
    provider_id: providerId,
    checked_at: state ? new Date(state.checkedAt).toISOString() : null,
    discovered_model_count: state?.discoveredModelIds.length || 0,
    models: getModelsForProvider(providerId),
  };
}

function taskPrefersFreeTier(taskType: TaskType): boolean {
  return taskType === 'fast-polling' || taskType === 'cost-optimized';
}

function isProviderSelectable(providerId: ProviderId): boolean {
  const accounts = getProviderAccounts(providerId);
  if (accounts.length > 0) {
    return accounts.some((account) => isProviderAccountSelectable(account));
  }

  const state = providerHealthState[providerId];
  if (!state) return true;
  if (state.quotaExhausted) return Date.now() >= state.cooldownUntil;
  if (state.online) return true;
  return Date.now() >= state.cooldownUntil;
}

function computeCandidateScore(
  model: ModelCatalogEntry,
  provider: ProviderConfig,
  taskType: TaskType,
  preferFreeTier: boolean,
): number {
  let score = model.priority + QUALITY_SCORE[model.quality] + QUALITY_SCORE[provider.quality];

  if (provider.recommended) score += 12;
  if (model.roles.includes(taskType)) score += 18;
  if (preferFreeTier && model.freeTierEligible) score += 20;
  if (!preferFreeTier && taskType === 'reasoning' && model.quality === 'A') score += 8;
  if (taskType === 'long-context') score += Math.round(model.contextWindow / 10000);

  return score;
}

function buildSelectionReason(
  taskType: TaskType,
  route: { provider: ProviderConfig; model: ModelCatalogEntry },
  preferFreeTier: boolean,
  degradedFallback: boolean,
): string {
  const reasons: string[] = [];
  reasons.push(`Task ${taskType} matched ${route.model.id} on ${route.provider.name}.`);

  if (preferFreeTier && route.model.freeTierEligible) {
    reasons.push('Free-tier eligible model was preferred for this task class.');
  }

  if (taskType === 'long-context') {
    reasons.push(`Selected for its ${route.model.contextWindow.toLocaleString()} token context window.`);
  }

  if (degradedFallback) {
    reasons.push('Fallback route used because higher-priority candidates were unavailable or excluded.');
  }

  return reasons.join(' ');
}

export async function executeWithProviderFailover<T>(
  taskType: TaskType,
  executor: (route: LLMRoute, account: ProviderAccountConfig | null) => Promise<T>,
  options: ProviderExecutionOptions = {},
): Promise<ProviderExecutionResult<T>> {
  const excludedProviders = new Set(options.excludeProviderIds || []);
  const excludedModels = new Set(options.excludeModelIds || []);
  const attempts: ProviderExecutionAttempt[] = [];

  for (let hop = 0; hop < PROVIDER_PRIORITY_ORDER.length + Object.keys(MODEL_CATALOG).length; hop += 1) {
    const route = routeRequest(taskType, {
      ...options,
      excludeProviderIds: [...excludedProviders],
      excludeModelIds: [...excludedModels],
    });

    const accounts = getProviderExecutionAccounts(route.provider.id)
      .filter((account) => isProviderAccountSelectable(account));
    const providerAccounts = accounts.length > 0 ? accounts : [null];
    let providerSucceeded = false;

    for (const account of providerAccounts) {
      try {
        const result = await executor(route, account);
        providerSucceeded = true;

        attempts.push({
          provider_id: route.provider.id,
          provider_name: route.provider.name,
          model_id: route.model.id,
          account_id: account?.id || null,
          success: true,
        });

        const providerState = getOrCreateProviderHealthState(route.provider.id);
        providerState.online = true;
        providerState.error = undefined;
        providerState.checkedAt = Date.now();
        providerState.cooldownUntil = 0;

        if (account) {
          markProviderAccountHealthy(account);
          recordProviderAccountUsage(account, {
            inputTokens: options.inputTokens || 0,
            outputTokens: options.outputTokens || 0,
            freeTierEligible: route.model.freeTierEligible,
          });
        }

        recordProviderUsage(route.provider.id, {
          inputTokens: options.inputTokens || 0,
          outputTokens: options.outputTokens || 0,
          freeTierEligible: route.model.freeTierEligible,
        });

        return {
          result,
          route,
          account,
          attempts,
        };
      } catch (error) {
        const failure = classifyProviderFailure(error);

        attempts.push({
          provider_id: route.provider.id,
          provider_name: route.provider.name,
          model_id: route.model.id,
          account_id: account?.id || null,
          success: false,
          error: failure.message,
        });

        if (account) {
          markProviderAccountUnavailable(account, {
            error: failure.message,
            authFailed: failure.authFailed,
            quotaExhausted: failure.quotaExhausted,
          });
        }

        const providerState = getOrCreateProviderHealthState(route.provider.id);
        providerState.online = false;
        providerState.error = failure.message;
        providerState.checkedAt = Date.now();
        providerState.cooldownUntil = Date.now() + route.provider.cooldownMs;

        if (failure.quotaExhausted) {
          markProviderQuotaExhausted(route.provider.id, failure.message);
        }
      }
    }

    if (!providerSucceeded) {
      excludedModels.add(route.model.id);
      excludedProviders.add(route.provider.id);
    }
  }

  const detail = attempts.length > 0
    ? attempts.map((attempt) => `${attempt.provider_id}/${attempt.model_id}${attempt.account_id ? `/${attempt.account_id}` : ''}: ${attempt.error || 'failed'}`).join('; ')
    : 'no provider attempts were possible';
  throw new Error(`All provider failover attempts failed for task ${taskType}: ${detail}`);
}

export function routeRequest(taskType: TaskType, options: RouteSelectionOptions = {}): LLMRoute {
  const requiredContextWindow = options.requiredContextWindow || 0;
  const preferFreeTier = options.preferFreeTier ?? taskPrefersFreeTier(taskType);
  const excludeProviderIds = new Set(options.excludeProviderIds || []);
  const excludeModelIds = new Set(options.excludeModelIds || []);

  const allCandidates = Object.values(MODEL_CATALOG)
    .concat(...PROVIDER_PRIORITY_ORDER.map((providerId) => Object.values(providerModelPoolState[providerId]?.discoveredEntries || {})))
    .filter((model) => model.roles.includes(taskType))
    .filter((model) => model.contextWindow >= requiredContextWindow)
    .filter((model, index, all) => all.findIndex((candidate) => candidate.id === model.id) === index)
    .filter((model) => isModelCurrentlySelectable(model))
    .filter((model) => !excludeModelIds.has(model.id))
    .filter((model) => !excludeProviderIds.has(model.providerId));

  const quotaFilteredCandidates = allCandidates.filter((model) => {
    if (!preferFreeTier || !model.freeTierEligible) {
      return true;
    }

    return !providerFreeQuotaExceeded(model.providerId);
  });

  const availableCandidates = quotaFilteredCandidates.filter((model) => isProviderSelectable(model.providerId));
  const degradedFallback = availableCandidates.length === 0 && quotaFilteredCandidates.length > 0;
  const candidatePool = availableCandidates.length > 0 ? availableCandidates : quotaFilteredCandidates;

  if (candidatePool.length === 0) {
    throw new Error(`No model route available for task type: ${taskType}`);
  }

  const ranked = candidatePool
    .map((model) => {
      const provider = PROVIDER_CONFIGS[model.providerId];
      return {
        provider,
        model,
        score: computeCandidateScore(model, provider, taskType, preferFreeTier),
      };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked[0]!;

  return {
    taskType,
    provider: selected.provider,
    model: selected.model,
    maxTokens: selected.model.maxTokens,
    selectionReason: buildSelectionReason(taskType, selected, preferFreeTier, degradedFallback),
    degradedFallback,
  };
}

export function estimateMonthlyCost(
  inputTokens: number,
  outputTokens: number,
  provider: ProviderIdentityLike,
): number {
  const inputCost = (inputTokens / 1000000) * provider.pricePerMInput;
  const outputCost = (outputTokens / 1000000) * provider.pricePerMOutput;
  return inputCost + outputCost;
}

export function estimateRequestCost(
  provider: ProviderIdentityLike,
  inputTokens: number,
  outputTokens: number,
  freeTierEligible: boolean,
): number | null {
  if (freeTierEligible && provider.freeTierAvailable) {
    return provider.pricePerMInput === 0 && provider.pricePerMOutput === 0
      ? 0
      : null;
  }

  return estimateMonthlyCost(inputTokens, outputTokens, provider);
}

export function buildModelTransparency(
  provider: ProviderIdentityLike,
  modelId: string,
  role: string,
  selectionReason: string,
  options: {
    freeTierEligible?: boolean;
    inputTokens?: number;
    outputTokens?: number;
    degradedFallback?: boolean;
  } = {},
): ModelTransparencyRecord {
  const estimatedCostUsd =
    options.inputTokens !== undefined && options.outputTokens !== undefined
      ? estimateRequestCost(
          provider,
          options.inputTokens,
          options.outputTokens,
          Boolean(options.freeTierEligible),
        )
      : null;

  return {
    provider_id: provider.id,
    provider_name: provider.name,
    model_id: modelId,
    role,
    selection_reason: selectionReason,
    free_tier_eligible: Boolean(options.freeTierEligible),
    estimated_cost_usd:
      estimatedCostUsd === null ? null : Math.round(estimatedCostUsd * 10000) / 10000,
    timestamp: new Date().toISOString(),
    degraded_fallback: Boolean(options.degradedFallback),
  };
}

export function getFallbackProvider(primary: ProviderConfig): ProviderConfig {
  const currentIndex = PROVIDER_PRIORITY_ORDER.findIndex((id) => id === primary.id);
  if (currentIndex === -1 || currentIndex === PROVIDER_PRIORITY_ORDER.length - 1) {
    return PROVIDER_CONFIGS.openrouter;
  }

  return PROVIDER_CONFIGS[PROVIDER_PRIORITY_ORDER[currentIndex + 1]!];
}

export async function healthCheckProviders(): Promise<Record<string, ProviderHealthResult>> {
  const results: Partial<Record<ProviderId, ProviderHealthResult>> = {};

  for (const [providerId, config] of Object.entries(PROVIDER_CONFIGS) as Array<[ProviderId, ProviderConfig]>) {
    const accounts = getProviderAccounts(providerId);
    const fallbackAccount = config.apiKey
      ? [{ id: `${providerId}-config`, providerId, apiKey: config.apiKey, label: `${config.name} config account` } satisfies ProviderAccountConfig]
      : [];
    const candidates = accounts.length > 0 ? accounts : fallbackAccount;

    try {
      const start = Date.now();
      let response: Response | null = null;
      let lastError: Error | null = null;
      let usableAccounts = 0;

      for (const account of candidates) {
        if (!isProviderAccountSelectable(account)) continue;

        try {
          response = await retryable(
            async () => {
              const res = await fetch(`${config.baseUrl}${config.healthPath}`, {
                headers: {
                  Authorization: `Bearer ${account.apiKey}`,
                },
                signal: AbortSignal.timeout(5000),
              });

              if (!res.ok && res.status !== 401) {
                const error = new Error(`Provider health failed for ${providerId}: ${res.status} ${res.statusText}`) as Error & {
                  status?: number;
                };
                error.status = res.status;
                throw error;
              }

              return res;
            },
            {
              maxAttempts: 3,
              baseDelayMs: 200,
              onRetry: (attempt, error) => {
                console.warn(`Provider health retry ${attempt} for ${providerId}/${account.id}: ${error instanceof Error ? error.message : String(error)}`);
              },
            },
          );

          markProviderAccountHealthy(account);
          usableAccounts += 1;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const message = lastError.message;
          markProviderAccountUnavailable(account, {
            error: message,
            authFailed: /401|403|unauthorized|forbidden/i.test(message),
            quotaExhausted: /quota\s+exceeded|rate.?limit|429/i.test(message),
          });
        }
      }

      if (!response) {
        throw lastError || new Error(`Provider health failed for ${providerId}`);
      }

      const latencyMs = Date.now() - start;
      const online = response.ok || response.status === 401;

      results[providerId] = {
        online,
        latencyMs,
        configuredAccounts: candidates.length,
        usableAccounts: Math.max(usableAccounts, online ? 1 : 0),
      };
      const state = getOrCreateProviderHealthState(providerId);
      providerHealthState[providerId] = {
        ...state,
        online,
        latencyMs,
        configuredAccounts: candidates.length,
        usableAccounts: Math.max(usableAccounts, online ? 1 : 0),
        checkedAt: Date.now(),
        cooldownUntil: online ? 0 : Date.now() + config.cooldownMs,
        error: undefined,
      };

      if (online && shouldRefreshProviderModelPool(providerId)) {
        try {
          await refreshProviderModelPool(providerId, true);
        } catch {
          // Keep static catalog if runtime discovery fails.
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results[providerId] = {
        online: false,
        error: message,
        configuredAccounts: candidates.length,
        usableAccounts: candidates.filter((account) => isProviderAccountSelectable(account)).length,
      };
      const state = getOrCreateProviderHealthState(providerId);
      providerHealthState[providerId] = {
        ...state,
        online: false,
        error: message,
        configuredAccounts: candidates.length,
        usableAccounts: candidates.filter((account) => isProviderAccountSelectable(account)).length,
        checkedAt: Date.now(),
        cooldownUntil: Date.now() + config.cooldownMs,
      };

      if (/quota\s+exceeded|rate.?limit|429/i.test(message)) {
        markProviderQuotaExhausted(providerId, message);
      }
    }
  }

  return results as Record<string, ProviderHealthResult>;
}

export function getPricingMatrix(
  inputTokensPerMonth: number,
  outputTokensPerMonth: number,
): Record<string, number> {
  const matrix: Record<string, number> = {};

  for (const [key, config] of Object.entries(PROVIDER_CONFIGS) as Array<[ProviderId, ProviderConfig]>) {
    matrix[key] = estimateMonthlyCost(inputTokensPerMonth, outputTokensPerMonth, config);
  }

  return matrix;
}

export function getCostComparison(): {
  ollama: number;
  deepseek: number;
  hybrid: number;
  savingsPercent: number;
} {
  const monthlyTokens = {
    input: 100_000_000,
    output: 100_000_000,
  };

  const ollama = 80;

  const deepseek = estimateMonthlyCost(
    monthlyTokens.input,
    monthlyTokens.output,
    PROVIDER_CONFIGS.deepseek,
  );

  const hybrid =
    (monthlyTokens.input * 0.9) / 1_000_000 * PROVIDER_CONFIGS.deepseek.pricePerMInput +
    (monthlyTokens.output * 0.9) / 1_000_000 * PROVIDER_CONFIGS.deepseek.pricePerMOutput +
    0 +
    (monthlyTokens.input * 0.05) / 1_000_000 * PROVIDER_CONFIGS.openrouter.pricePerMInput +
    (monthlyTokens.output * 0.05) / 1_000_000 * PROVIDER_CONFIGS.openrouter.pricePerMOutput;

  return {
    ollama,
    deepseek: Math.round(deepseek * 100) / 100,
    hybrid: Math.round(hybrid * 100) / 100,
    savingsPercent: Math.round(((ollama - hybrid) / ollama) * 100),
  };
}

export function getProviderInventory(): ProviderInventoryEntry[] {
  return PROVIDER_PRIORITY_ORDER.map((providerId) => {
    const provider = PROVIDER_CONFIGS[providerId];
    const configuredAccounts = getProviderAccounts(providerId);
    const configuredEnvNames = listConfiguredProviderEnvNames(providerId);
    const discoveredEntries = providerModelPoolState[providerId]?.discoveredEntries || {};
    const staticModelCount = Object.values(MODEL_CATALOG).filter((model) => model.providerId === providerId).length;
    const usesFallbackConfigAccount = configuredAccounts.length === 0 && Boolean(provider.apiKey);

    return {
      provider_id: providerId,
      provider_name: provider.name,
      adapter_status: configuredAccounts.length > 0 || provider.apiKey ? 'supported-active' : 'supported-inactive',
      configured: configuredAccounts.length > 0 || Boolean(provider.apiKey),
      configured_account_count: configuredAccounts.length > 0 ? configuredAccounts.length : provider.apiKey ? 1 : 0,
      uses_fallback_config_account: usesFallbackConfigAccount,
      configured_env_names: configuredEnvNames,
      candidate_env_names: listProviderAccountEnvCandidates(providerId),
      static_model_count: staticModelCount,
      discovered_model_count: Object.keys(discoveredEntries).length,
      base_url: provider.baseUrl,
      health_path: provider.healthPath,
      supports_chat_completions: true,
      supports_model_discovery: true,
      supports_multi_account: true,
      recommended: provider.recommended,
      allocation_percent: provider.allocationPercent,
      free_tier_available: provider.freeTierAvailable,
    };
  });
}