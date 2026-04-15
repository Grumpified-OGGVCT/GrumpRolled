type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_name?: string;
};

import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import {
  createOrchestrationGovernanceMetadata,
  ORCHESTRATION_SNAPSHOT_ACTION,
  ORCHESTRATION_SNAPSHOT_TARGET,
  parseOrchestrationGovernanceMetadata,
  type OrchestrationTelemetrySnapshot,
} from '@/lib/governance-events';
import { getProviderServiceAdapter } from '@/lib/provider-service-adapters';
import {
  buildModelTransparency,
  executeWithProviderFailover,
  routeRequest,
  type LLMRoute,
  type ModelTransparencyRecord,
  type ProviderAccountConfig,
  type ProviderIdentityLike,
  type ProviderExecutionOptions,
  type TaskType,
} from '@/lib/llm-provider-router';

type RoutedChatOutcome = {
  content: string;
  route: LLMRoute;
  account: ProviderAccountConfig | null;
};

type OllamaModelSummary = {
  name: string;
  model: string;
  modified_at?: string;
};

type OllamaTagsResponse = {
  models: OllamaModelSummary[];
};

type OllamaShowResponse = {
  capabilities?: string[];
  modified_at?: string;
  details?: {
    parameter_size?: string;
    family?: string;
    quantization_level?: string;
  };
};

export type ModelMatrixEntry = {
  model: string;
  capabilities: string[];
  parameterSizeRaw: string;
  parameterSizeNumeric: number;
  modifiedAt: string;
  family: string;
};

export type AnswerQuality = {
  answer: string;
  verification: string;
  modelPrimary: string;
  modelVerifier: string;
  modelPrimaryReason: string;
  modelVerifierReason: string;
  selectionSummary: string;
  primaryTransparency: ModelTransparencyRecord;
  verifierTransparency: ModelTransparencyRecord;
  usedWebSearch: boolean;
  confidence: number;
  citations: Array<{ title?: string; url?: string }>;
  contextBudgetChars: number;
  contextUsedChars: number;
  contextSourcesUsed: number;
  knowledgeAnchorsUsed: number;
  contextTelemetry: {
    freshnessBudgetChars: number;
    freshnessUsedChars: number;
    freshnessSourcesUsed: number;
    freshnessRecoveryRequested: boolean;
    freshnessRecoveryAttempted: boolean;
    anchorChars: number;
    anchorContextCapped: boolean;
    consistencyHintChars: number;
    consistencyHintsUsed: number;
    totalContextChars: number;
    totalSourceBlocks: number;
    compressionApplied: boolean;
    compressionReasons: string[];
  };
  degradedState: {
    degraded: boolean;
    reasons: string[];
    freshnessRecoveryFailed: boolean;
    primaryRouteFailed: boolean;
    verifierRouteFailed: boolean;
    verifierReusedPrimaryModel: boolean;
  };
  consistencyKey: string;
  consistencyCacheHit: boolean;
};

const OLLAMA_BASE_URL = process.env.OLLAMA_API_BASE_URL || 'https://ollama.com/api';
const MODEL_MATRIX_TTL_MS = 1000 * 60 * 60 * 24;
const MAX_RPS = Math.max(1, Number(process.env.OLLAMA_MAX_RPS || 5));
const RETRIES_PER_KEY = Math.max(1, Number(process.env.OLLAMA_RETRIES_PER_KEY || 2));
const CONTEXT_MAX_CHARS = Math.max(2000, Number(process.env.OLLAMA_CTX_MAX_CHARS || 16000));
const CONTEXT_MIN_CHARS = Math.max(1500, Number(process.env.OLLAMA_CTX_MIN_CHARS || 4000));
const WEB_SEARCH_POLICY = 'ollama-sidecar';

const FRESHNESS_CUE_REGEX = /\b(today|current|latest|now|as of|recent|price|weather|stock|breaking|202[4-9])\b/i;

let matrixCache: { fetchedAt: number; entries: ModelMatrixEntry[] } | null = null;
let nextAllowedAt = 0;
const CONSISTENCY_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const consistencyCache = new Map<string, { answer: string; updatedAt: number }>();
let lastOrchestrationTelemetrySnapshot: OrchestrationTelemetrySnapshot | null = null;
const OLLAMA_PROVIDER: ProviderIdentityLike = {
  id: 'ollama-cloud',
  name: 'Ollama Cloud — ACTIVE ANSWER BACKEND',
  pricePerMInput: 0,
  pricePerMOutput: 0,
  freeTierAvailable: false,
};

function parseParameterSize(raw: string | undefined): number {
  if (!raw) return 0;
  const normalized = raw.toUpperCase().replace(/\s+/g, '');
  const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)([BMK]?)/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === 'B') return value * 1_000_000_000;
  if (unit === 'M') return value * 1_000_000;
  if (unit === 'K') return value * 1_000;
  return value;
}

function compareIsoDate(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function buildConsistencyKey(question: string): string {
  const tokens = [...new Set(tokenize(question))].sort().slice(0, 20).join('|');
  return createHash('sha256').update(tokens).digest('hex').slice(0, 16);
}

function buildQuestionHash(question: string): string {
  return createHash('sha256').update(question.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export function getLastOrchestrationTelemetrySnapshot(): OrchestrationTelemetrySnapshot | null {
  return lastOrchestrationTelemetrySnapshot;
}

const telemetryStore = db as typeof db & {
  orchestrationTelemetry: {
    create: (args: {
      data: {
        action: string;
        targetType: string;
        targetId: string;
        metadata: string;
      };
    }) => Promise<unknown>;
    findMany: (args: {
      where: {
        action: string;
        targetType: string;
        createdAt?: { gte: Date };
      };
      orderBy: { createdAt: 'desc' };
      take: number;
    }) => Promise<Array<{ metadata: string }>>;
  };
};

async function persistOrchestrationTelemetrySnapshot(snapshot: OrchestrationTelemetrySnapshot): Promise<void> {
  await telemetryStore.orchestrationTelemetry.create({
    data: {
      action: ORCHESTRATION_SNAPSHOT_ACTION,
      targetType: ORCHESTRATION_SNAPSHOT_TARGET,
      targetId: snapshot.questionHash,
      metadata: createOrchestrationGovernanceMetadata(snapshot),
    },
  });
}

export async function getPersistedOrchestrationTelemetryHistory(
  limit = 10,
  since?: Date
): Promise<OrchestrationTelemetrySnapshot[]> {
  const records = await telemetryStore.orchestrationTelemetry.findMany({
    where: {
      action: ORCHESTRATION_SNAPSHOT_ACTION,
      targetType: ORCHESTRATION_SNAPSHOT_TARGET,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return records
    .map((record) => parseOrchestrationGovernanceMetadata(record.metadata))
    .filter((snapshot): snapshot is OrchestrationTelemetrySnapshot => Boolean(snapshot));
}

function computeDynamicContextBudget(question: string, needFresh: boolean): number {
  const questionLength = question.length;
  const complexityBoost = Math.min(6000, Math.floor(questionLength * 2.2));
  const freshnessBoost = needFresh ? 2500 : 0;
  const budget = CONTEXT_MIN_CHARS + complexityBoost + freshnessBoost;
  return Math.max(CONTEXT_MIN_CHARS, Math.min(CONTEXT_MAX_CHARS, budget));
}

function scoreWebResult(question: string, result: { title?: string; content?: string; url?: string }): number {
  const qTokens = new Set(tokenize(question));
  const titleTokens = tokenize(result.title || '');
  const contentTokens = tokenize((result.content || '').slice(0, 2500));

  let overlap = 0;
  for (const t of titleTokens) {
    if (qTokens.has(t)) overlap += 2;
  }
  for (const t of contentTokens) {
    if (qTokens.has(t)) overlap += 1;
  }

  const trustedDomainBoost = /github\.com|docs\.|python\.org|developer\.|mdn\./i.test(result.url || '') ? 4 : 0;
  return overlap + trustedDomainBoost;
}

function buildContextPack(
  question: string,
  results: Array<{ title?: string; url?: string; content?: string }>,
  budgetChars: number
): {
  context: string;
  usedChars: number;
  usedSources: number;
  compressionApplied: boolean;
  compressionReasons: string[];
} {
  const ranked = [...results]
    .map((r) => ({ ...r, _score: scoreWebResult(question, r) }))
    .sort((a, b) => b._score - a._score);

  const blocks: string[] = [];
  let used = 0;
  let usedSources = 0;
  let truncatedSource = false;

  const perSourceCap = Math.max(600, Math.floor(budgetChars * 0.38));

  for (let i = 0; i < ranked.length; i += 1) {
    if (used >= budgetChars) break;
    const r = ranked[i];
    const header = `Result ${i + 1}: ${r.title || 'Untitled'} | ${r.url || ''}`;
    const remaining = budgetChars - used;
    if (remaining < 200) break;

    const bodyCap = Math.max(0, Math.min(perSourceCap, remaining - header.length - 2));
    const body = (r.content || '').slice(0, bodyCap);
    if (body.length < (r.content || '').length) {
      truncatedSource = true;
    }
    const block = `${header}\n${body}`;

    blocks.push(block);
    used += block.length + 2;
    usedSources += 1;
  }

  return {
    context: blocks.join('\n\n'),
    usedChars: used,
    usedSources,
    compressionApplied: truncatedSource || ranked.length > usedSources,
    compressionReasons: [
      ...(truncatedSource ? ['freshness_source_truncated'] : []),
      ...(ranked.length > usedSources ? ['freshness_budget_limited'] : []),
    ],
  };
}

type KnowledgeAnchor = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  confidence: number;
};

async function retrieveKnowledgeAnchors(question: string, limit = 5): Promise<KnowledgeAnchor[]> {
  const candidates = await db.verifiedPattern.findMany({
    where: {
      validationStatus: 'VERIFIED',
      confidence: { gte: 0.65 },
      publishedAt: { not: null },
      deprecatedAt: null,
    },
    orderBy: [{ confidence: 'desc' }, { verificationCount: 'desc' }, { updatedAt: 'desc' }],
    take: 120,
  });

  const qTokens = new Set(tokenize(question));
  const scored = candidates
    .map((p) => {
      const tags = (() => {
        try {
          const parsed = JSON.parse(p.tags || '[]');
          return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
        } catch {
          return [];
        }
      })();

      const titleTokens = tokenize(p.title || '');
      const descTokens = tokenize((p.description || '').slice(0, 1200));
      const tagTokens = tags.flatMap((t) => tokenize(t));

      let overlap = 0;
      for (const t of titleTokens) if (qTokens.has(t)) overlap += 3;
      for (const t of descTokens) if (qTokens.has(t)) overlap += 1;
      for (const t of tagTokens) if (qTokens.has(t)) overlap += 2;

      const score = overlap + p.confidence * 4;
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        tags,
        confidence: p.confidence,
        score,
      };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ score: _score, ...rest }) => rest);
}

function buildKnowledgeAnchorContext(
  anchors: KnowledgeAnchor[],
  maxChars = 5000
): { context: string; usedChars: number; usedAnchors: number; compressionApplied: boolean } {
  let remaining = maxChars;
  const blocks: string[] = [];
  let usedAnchors = 0;

  for (let i = 0; i < anchors.length; i += 1) {
    if (remaining < 250) break;
    const a = anchors[i];
    const header = `Anchor ${i + 1}: ${a.title} (confidence ${Math.round(a.confidence * 100)}%)`;
    const tagLine = a.tags.length > 0 ? `Tags: ${a.tags.slice(0, 6).join(', ')}` : 'Tags: n/a';
    const body = (a.description || '').slice(0, Math.max(0, remaining - header.length - tagLine.length - 20));
    const block = `${header}\n${tagLine}\n${body}`;
    blocks.push(block);
    remaining -= block.length + 2;
    usedAnchors += 1;
  }

  const context = blocks.join('\n\n');

  return {
    context,
    usedChars: context.length,
    usedAnchors,
    compressionApplied: usedAnchors < anchors.length,
  };
}

function getApiKeys(): string[] {
  const keys = [
    process.env.OLLAMA_API_KEY_1,
    process.env.OLLAMA_API_KEY_2,
    process.env.OLLAMA_API_KEY,
  ].filter((k): k is string => Boolean(k && k.trim()));

  return [...new Set(keys)];
}

function hasOllamaSidecarAccess(): boolean {
  return getApiKeys().length > 0;
}

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const minInterval = Math.ceil(1000 / MAX_RPS);
  if (nextAllowedAt > now) {
    await new Promise((resolve) => setTimeout(resolve, nextAllowedAt - now));
  }
  nextAllowedAt = Math.max(now, nextAllowedAt) + minInterval;
}

async function requestWithFallback<T>(
  endpoint: string,
  method: 'GET' | 'POST',
  payload?: unknown
): Promise<T> {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error('No Ollama API keys configured. Set OLLAMA_API_KEY_1/2 or OLLAMA_API_KEY.');
  }

  let lastError: string | null = null;

  for (const key of keys) {
    for (let attempt = 0; attempt < RETRIES_PER_KEY; attempt += 1) {
      await rateLimitWait();

      const response = await fetch(`${OLLAMA_BASE_URL}${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: method === 'POST' ? JSON.stringify(payload || {}) : undefined,
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After') || 1);
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000));
        lastError = `429 rate-limited on ${endpoint}`;
        continue;
      }

      const errorBody = await response.text();
      lastError = `${response.status} ${response.statusText} ${errorBody}`;
      break;
    }
  }

  throw new Error(`Ollama request failed for ${endpoint}: ${lastError || 'unknown error'}`);
}

export async function refreshModelMatrix(force = false): Promise<ModelMatrixEntry[]> {
  const now = Date.now();
  if (!force && matrixCache && now - matrixCache.fetchedAt < MODEL_MATRIX_TTL_MS) {
    return matrixCache.entries;
  }

  const tags = await requestWithFallback<OllamaTagsResponse>('/tags', 'GET');
  const entries: ModelMatrixEntry[] = [];

  for (const model of tags.models || []) {
    try {
      const details = await requestWithFallback<OllamaShowResponse>('/show', 'POST', {
        model: model.model || model.name,
      });

      entries.push({
        model: model.model || model.name,
        capabilities: details.capabilities || [],
        parameterSizeRaw: details.details?.parameter_size || '0',
        parameterSizeNumeric: parseParameterSize(details.details?.parameter_size),
        modifiedAt: details.modified_at || model.modified_at || new Date(0).toISOString(),
        family: details.details?.family || 'unknown',
      });
    } catch {
      // Skip models that cannot be introspected now.
    }
  }

  entries.sort((a, b) => {
    const dateCmp = compareIsoDate(a.modifiedAt, b.modifiedAt);
    if (dateCmp !== 0) return dateCmp;
    return b.parameterSizeNumeric - a.parameterSizeNumeric;
  });

  matrixCache = { fetchedAt: now, entries };
  return entries;
}

export async function selectBestModel(needs: string[], excludeModel?: string): Promise<ModelMatrixEntry> {
  const matrix = await refreshModelMatrix();
  const candidates = matrix.filter((entry) => {
    if (excludeModel && entry.model === excludeModel) return false;
    return needs.every((need) => entry.capabilities.includes(need));
  });

  if (candidates.length === 0) {
    throw new Error(`No model satisfies capabilities: ${needs.join(', ')}`);
  }

  return candidates[0];
}

async function chatCompletion(model: string, messages: OllamaChatMessage[], think = false): Promise<string> {
  const response = await requestWithFallback<{ message?: { content?: string } }>('/chat', 'POST', {
    model,
    messages,
    stream: false,
    think: think ? 'low' : undefined,
  });

  return response.message?.content || '';
}

function estimateTokenCount(text: string): number {
  // Lightweight estimate until provider-native token usage is fully normalized.
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateMessagesTokens(messages: OllamaChatMessage[]): number {
  return messages.reduce((total, message) => total + estimateTokenCount(message.content), 0);
}

async function requestProviderChatCompletion(
  route: LLMRoute,
  account: ProviderAccountConfig | null,
  messages: OllamaChatMessage[],
): Promise<string> {
  const apiKey = account?.apiKey || route.provider.apiKey;
  if (!apiKey) {
    throw new Error(`Provider ${route.provider.id} has no API key available for execution.`);
  }

  const adapter = getProviderServiceAdapter(route.provider.serviceHostId);

  const response = await fetch(`${route.provider.baseUrl}${adapter.chatPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      adapter.buildChatRequest(
        route.model.id,
        messages.map((message) => ({ role: message.role, content: message.content })),
      ),
    ),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Provider ${route.provider.id} chat failed: ${response.status} ${response.statusText} ${errorBody}`);
  }

  const payload = (await response.json()) as unknown;
  const content = adapter.parseChatResponse(payload);
  if (!content) {
    throw new Error(`Provider ${route.provider.id} returned empty chat content for model ${route.model.id}.`);
  }

  return content;
}

async function routedChatCompletion(
  taskType: TaskType,
  messages: OllamaChatMessage[],
  options: ProviderExecutionOptions = {},
): Promise<RoutedChatOutcome> {
  const execution = await executeWithProviderFailover(
    taskType,
    async (route, account) => {
      return requestProviderChatCompletion(route, account, messages);
    },
    {
      ...options,
      inputTokens: options.inputTokens ?? estimateMessagesTokens(messages),
      outputTokens: options.outputTokens ?? 0,
    },
  );

  return {
    content: execution.result,
    route: execution.route,
    account: execution.account,
  };
}

async function runWebSearch(query: string, maxResults = 5): Promise<Array<{ title?: string; url?: string; content?: string }>> {
  const response = await requestWithFallback<{ results?: Array<{ title?: string; url?: string; content?: string }> }>(
    '/web_search',
    'POST',
    { query, max_results: maxResults }
  );

  return response.results || [];
}

export function queryNeedsFreshData(question: string): boolean {
  return FRESHNESS_CUE_REGEX.test(question);
}

function shouldUseOllamaWebSearchSidecar(): boolean {
  return WEB_SEARCH_POLICY === 'ollama-sidecar' && hasOllamaSidecarAccess();
}

export async function answerWithTriplePass(question: string): Promise<AnswerQuality> {
  const needFresh = queryNeedsFreshData(question);
  const consistencyKey = buildConsistencyKey(question);
  const cached = consistencyCache.get(consistencyKey);
  const cacheIsFresh = Boolean(cached && Date.now() - cached.updatedAt < CONSISTENCY_CACHE_TTL_MS);
  const consistencyCacheHit = Boolean(cacheIsFresh && !needFresh);

  const anchors = await retrieveKnowledgeAnchors(question, 5);
  const anchorPack = buildKnowledgeAnchorContext(anchors, 5200);
  const anchorContext = anchorPack.context;

  const primaryModel = await selectBestModel([]);
  const verifierModel = await selectBestModel([], primaryModel.model).catch(() => primaryModel);
  const contextBudgetChars = computeDynamicContextBudget(question, needFresh);

  const primaryFallbackReason =
    `Selected ${primaryModel.model} as current top-ranked model by freshness and parameter capacity in the daily matrix.`;
  const verifierFallbackReason =
    verifierModel.model === primaryModel.model
      ? `Verifier fallback reused ${verifierModel.model} because no distinct ranked alternative was available at request time.`
      : `Selected ${verifierModel.model} as an independent verifier from the ranked matrix to cross-check the primary answer.`;

  const systemGuardrail: OllamaChatMessage = {
    role: 'system',
    content:
      'Prioritize accuracy. If uncertain, say so. Do not invent facts. Keep answer concise and evidence-aware. Maintain consistency with verified knowledge anchors unless new evidence clearly contradicts them.',
  };

  const anchorMessage: OllamaChatMessage | null =
    anchorContext.length > 0
      ? {
          role: 'system',
          content: `Verified knowledge anchors for consistency:\n${anchorContext}`,
        }
      : null;

  const priorConsistencyMessage: OllamaChatMessage | null =
    consistencyCacheHit && cached
      ? {
          role: 'system',
          content:
            `Prior consistent answer for a semantically similar question (use as soft alignment anchor, do not copy blindly):\n${cached.answer.slice(0, 1800)}`,
        }
      : null;

  const primaryMessages: OllamaChatMessage[] = [systemGuardrail];
  if (anchorMessage) primaryMessages.push(anchorMessage);
  if (priorConsistencyMessage) primaryMessages.push(priorConsistencyMessage);
  primaryMessages.push({ role: 'user', content: question });

  let answer = '';
  let modelPrimary = primaryModel.model;
  let modelVerifier = verifierModel.model;
  let primaryReason = primaryFallbackReason;
  let verifierReason = verifierFallbackReason;
  let selectionSummary = '';
  let primaryProvider = OLLAMA_PROVIDER;
  let verifierProvider = OLLAMA_PROVIDER;
  let primaryFreeTierEligible = false;
  let verifierFreeTierEligible = false;
  let primaryDegradedFallback = false;
  let verifierDegradedFallback = false;
  let primaryRoutedOutcome: RoutedChatOutcome | null = null;
  let primaryRouteFailed = false;
  let verifierRouteFailed = false;
  let freshnessRecoveryAttempted = false;
  let freshnessRecoveryFailed = false;
  const degradedReasons = new Set<string>();

  try {
    primaryRoutedOutcome = await routedChatCompletion('reasoning', primaryMessages, {
      preferFreeTier: false,
    });
    answer = primaryRoutedOutcome.content;
    modelPrimary = primaryRoutedOutcome.route.model.id;
    primaryReason = primaryRoutedOutcome.route.selectionReason;
    primaryProvider = primaryRoutedOutcome.route.provider;
    primaryFreeTierEligible = primaryRoutedOutcome.route.model.freeTierEligible;
    primaryDegradedFallback = primaryRoutedOutcome.route.degradedFallback;
  } catch {
    primaryRouteFailed = true;
    degradedReasons.add('primary_routed_provider_failed');
    answer = await chatCompletion(primaryModel.model, primaryMessages);
  }

  const verificationPrompt: OllamaChatMessage[] = [
    systemGuardrail,
    ...(anchorMessage ? [anchorMessage] : []),
    {
      role: 'user',
      content: `Verify this answer for correctness and freshness. Answer text: ${answer}`,
    },
  ];

  let verification = '';
  try {
    const verifierRoutedOutcome = await routedChatCompletion('reasoning', verificationPrompt, {
      preferFreeTier: false,
      excludeModelIds: primaryRoutedOutcome ? [primaryRoutedOutcome.route.model.id] : undefined,
      excludeProviderIds: primaryRoutedOutcome ? [primaryRoutedOutcome.route.provider.id] : undefined,
    });
    verification = verifierRoutedOutcome.content;
    modelVerifier = verifierRoutedOutcome.route.model.id;
    verifierReason = verifierRoutedOutcome.route.selectionReason;
    verifierProvider = verifierRoutedOutcome.route.provider;
    verifierFreeTierEligible = verifierRoutedOutcome.route.model.freeTierEligible;
    verifierDegradedFallback = verifierRoutedOutcome.route.degradedFallback;
  } catch {
    verifierRouteFailed = true;
    degradedReasons.add('verifier_routed_provider_failed');
    verification = await chatCompletion(verifierModel.model, verificationPrompt, true);
  }

  if (primaryRoutedOutcome) {
    const verifierRoutePreview = routeRequest('reasoning', {
      excludeModelIds: [primaryRoutedOutcome.route.model.id],
      excludeProviderIds: [primaryRoutedOutcome.route.provider.id],
    });

    selectionSummary =
      `Primary model ${modelPrimary} selected via router (${primaryProvider.name}); ` +
      `verifier ${verifierRoutePreview.model.id} selected as independent routed cross-check.`;
  } else {
    selectionSummary =
      `Primary model ${primaryModel.model} selected from the active Ollama Cloud matrix; ` +
      `verifier ${verifierModel.model} assigned for independent QA cross-check.`;
  }

  let usedWebSearch = false;
  let citations: Array<{ title?: string; url?: string }> = [];
  let contextUsedChars = 0;
  let contextSourcesUsed = 0;
  let freshnessCompressionApplied = false;
  let freshnessCompressionReasons: string[] = [];

  const verifierFlagsProblem = /incorrect|cannot verify|uncertain|outdated|insufficient/i.test(verification);
  const freshnessRecoveryRequested = needFresh || verifierFlagsProblem;
  if (freshnessRecoveryRequested && !shouldUseOllamaWebSearchSidecar()) {
    degradedReasons.add('freshness_sidecar_unavailable');
    freshnessRecoveryFailed = true;
  }

  if (freshnessRecoveryRequested && shouldUseOllamaWebSearchSidecar()) {
    freshnessRecoveryAttempted = true;
    try {
      const results = await runWebSearch(question, 5);
      usedWebSearch = true;
      citations = results.slice(0, 3).map((r) => ({ title: r.title, url: r.url }));
      const packed = buildContextPack(question, results, contextBudgetChars);
      const context = packed.context;
      contextUsedChars = packed.usedChars;
      contextSourcesUsed = packed.usedSources;
      freshnessCompressionApplied = packed.compressionApplied;
      freshnessCompressionReasons = packed.compressionReasons;

      const groundedPrompt: OllamaChatMessage[] = [
        systemGuardrail,
        ...(anchorMessage ? [anchorMessage] : []),
        ...(priorConsistencyMessage ? [priorConsistencyMessage] : []),
        {
          role: 'user',
          content:
            `Question: ${question}\n\nUse only this retrieved context when needed and provide a grounded answer:\n${context}`,
        },
      ];

      if (primaryRoutedOutcome) {
        try {
          answer = await requestProviderChatCompletion(
            primaryRoutedOutcome.route,
            primaryRoutedOutcome.account,
            groundedPrompt,
          );
        } catch {
          answer = await chatCompletion(primaryModel.model, groundedPrompt);
        }
      } else {
        answer = await chatCompletion(primaryModel.model, groundedPrompt);
      }
    } catch {
      usedWebSearch = false;
      freshnessRecoveryFailed = true;
      degradedReasons.add('freshness_retrieval_failed');
    }
  }

  const confidence = usedWebSearch ? 0.82 : 0.72;

  consistencyCache.set(consistencyKey, {
    answer,
    updatedAt: Date.now(),
  });

  const primaryTransparency = buildModelTransparency(
    primaryProvider,
    modelPrimary,
    'primary',
    primaryReason,
    {
      degradedFallback: primaryDegradedFallback,
      freeTierEligible: primaryFreeTierEligible,
    }
  );
  const verifierTransparency = buildModelTransparency(
    verifierProvider,
    modelVerifier,
    'verifier',
    verifierReason,
    {
      degradedFallback: verifierDegradedFallback,
      freeTierEligible: verifierFreeTierEligible,
    }
  );

  const verifierReusedPrimaryModel = modelVerifier === modelPrimary;
  if (verifierReusedPrimaryModel) {
    degradedReasons.add('verifier_reused_primary_model');
  }

  const consistencyHintChars = priorConsistencyMessage?.content.length || 0;
  const consistencyHintsUsed = priorConsistencyMessage ? 1 : 0;
  const totalContextChars = anchorPack.usedChars + consistencyHintChars + contextUsedChars;
  const totalSourceBlocks = anchorPack.usedAnchors + consistencyHintsUsed + contextSourcesUsed;
  const compressionReasons = [
    ...(anchorPack.compressionApplied ? ['anchor_context_capped'] : []),
    ...freshnessCompressionReasons,
  ];
  const contextTelemetry = {
    freshnessBudgetChars: contextBudgetChars,
    freshnessUsedChars: contextUsedChars,
    freshnessSourcesUsed: contextSourcesUsed,
    freshnessRecoveryRequested,
    freshnessRecoveryAttempted,
    anchorChars: anchorPack.usedChars,
    anchorContextCapped: anchorPack.compressionApplied,
    consistencyHintChars,
    consistencyHintsUsed,
    totalContextChars,
    totalSourceBlocks,
    compressionApplied: compressionReasons.length > 0,
    compressionReasons,
  };
  const degradedState = {
    degraded: degradedReasons.size > 0,
    reasons: [...degradedReasons],
    freshnessRecoveryFailed,
    primaryRouteFailed,
    verifierRouteFailed,
    verifierReusedPrimaryModel,
  };

  lastOrchestrationTelemetrySnapshot = {
    recordedAt: new Date().toISOString(),
    questionHash: buildQuestionHash(question),
    primaryModel: modelPrimary,
    verifierModel: modelVerifier,
    confidence,
    usedWebSearch,
    knowledgeAnchorsUsed: anchors.length,
    contextTelemetry,
    degradedState,
  };

  void persistOrchestrationTelemetrySnapshot(lastOrchestrationTelemetrySnapshot).catch((error) => {
    console.error('Failed to persist orchestration telemetry snapshot:', error);
  });

  return {
    answer,
    verification,
    modelPrimary,
    modelVerifier,
    modelPrimaryReason: primaryReason,
    modelVerifierReason: verifierReason,
    selectionSummary,
    primaryTransparency,
    verifierTransparency,
    usedWebSearch,
    confidence,
    citations,
    contextBudgetChars,
    contextUsedChars,
    contextSourcesUsed,
    knowledgeAnchorsUsed: anchors.length,
    contextTelemetry,
    degradedState,
    consistencyKey,
    consistencyCacheHit,
  };
}
