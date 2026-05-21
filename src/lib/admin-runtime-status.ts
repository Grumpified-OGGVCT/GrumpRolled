import Redis from 'ioredis';

import { getChatOverflowWriteConfig } from '@/lib/cross-post';
import { db } from '@/lib/db';
import { getProviderInventory, healthCheckProviders } from '@/lib/llm-provider-router';
import { attachRedisNoiseGuard, createRedisOptions, getRedisUrl, parseRedisVersion, redisSupportsBullMQ } from '@/lib/redis-config';
import { recordRuntimeEvent, resolveRuntimeEvent } from '@/lib/runtime-observability';

export type RuntimeServiceStatus = 'healthy' | 'degraded' | 'down' | 'disabled';

export interface RuntimeServiceDrilldownItem {
  key: string;
  label: string;
  status?: RuntimeServiceStatus;
  detail?: string;
  why_degraded?: string | null;
  last_error?: string | null;
  env_source?: string | null;
  effective_endpoint?: string | null;
}

export interface RuntimeServiceDiagnostics {
  why_degraded?: string | null;
  last_error?: string | null;
  env_source?: string | null;
  effective_endpoint?: string | null;
  suggested_remediation?: string[];
  drilldown_items?: RuntimeServiceDrilldownItem[];
}

export interface RuntimeServiceSnapshot {
  key: string;
  label: string;
  status: RuntimeServiceStatus;
  detail: string;
  latency_ms?: number;
  meta?: Record<string, string | number | boolean | null>;
  diagnostics?: RuntimeServiceDiagnostics;
}

export interface RuntimeStatusSnapshot {
  refreshed_at: string;
  overall_status: Exclude<RuntimeServiceStatus, 'disabled'>;
  summary: {
    healthy: number;
    degraded: number;
    down: number;
    disabled: number;
  };
  services: RuntimeServiceSnapshot[];
}

function syncRuntimeServiceEvent(service: RuntimeServiceSnapshot) {
  const eventKey = `runtime:${service.key}`;

  if (service.status === 'degraded' || service.status === 'down') {
    recordRuntimeEvent({
      key: eventKey,
      lane: 'runtime',
      source: service.key,
      severity: service.status === 'down' ? 'critical' : 'warning',
      message: service.detail,
    });
    return;
  }

  resolveRuntimeEvent(eventKey);
}

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text-v2-moe:latest';

function normalizeLoopbackUrl(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  return raw.replace(/^([a-z]+:\/\/)localhost(?=[:/]|$)/i, (_, protocol: string) => `${protocol}127.0.0.1`);
}

async function withTiming<T>(fn: () => Promise<T>): Promise<{ latencyMs: number; value: T }> {
  const startedAt = Date.now();
  const value = await fn();
  return { latencyMs: Date.now() - startedAt, value };
}

function buildRemediation(...items: Array<string | false | null | undefined>) {
  return items.filter((item): item is string => Boolean(item));
}

function describeDatabaseTarget() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return {
      envSource: 'DATABASE_URL (missing)',
      endpoint: 'not configured',
    };
  }

  try {
    const parsed = new URL(databaseUrl);
    const databaseName = parsed.pathname.replace(/^\//, '') || 'unknown';
    return {
      envSource: 'DATABASE_URL',
      endpoint: `${parsed.hostname}:${parsed.port || '5432'}/${databaseName}`,
    };
  } catch {
    return {
      envSource: 'DATABASE_URL',
      endpoint: 'unparseable database URL',
    };
  }
}

function formatProviderEnvSource(configuredEnvNames: string[], usesFallbackConfigAccount: boolean) {
  if (configuredEnvNames.length > 0) {
    return configuredEnvNames.join(', ');
  }

  return usesFallbackConfigAccount ? 'provider fallback config account' : 'not configured';
}

async function checkDatabase(): Promise<RuntimeServiceSnapshot> {
  const target = describeDatabaseTarget();

  try {
    const { latencyMs } = await withTiming(() => db.$queryRaw`SELECT 1`);
    return {
      key: 'database',
      label: 'Postgres',
      status: 'healthy',
      detail: 'Primary application database reachable.',
      latency_ms: latencyMs,
      diagnostics: {
        env_source: target.envSource,
        effective_endpoint: target.endpoint,
        suggested_remediation: buildRemediation('If this goes down, verify DATABASE_URL, PostgreSQL container/service, and Prisma client connectivity.'),
      },
    };
  } catch (error) {
    const lastError = error instanceof Error ? error.message : 'Database check failed.';
    return {
      key: 'database',
      label: 'Postgres',
      status: 'down',
      detail: lastError,
      diagnostics: {
        why_degraded: 'The database health query could not complete.',
        last_error: lastError,
        env_source: target.envSource,
        effective_endpoint: target.endpoint,
        suggested_remediation: buildRemediation('Verify PostgreSQL is running and reachable on the configured host/port.', 'Confirm DATABASE_URL still targets the active local or managed Postgres instance.'),
      },
    };
  }
}

async function checkRedis(): Promise<RuntimeServiceSnapshot> {
  const redisUrl = getRedisUrl();
  let client: Redis | null = null;
  const envSource = process.env.REDIS_URL?.trim() ? 'REDIS_URL' : 'default redis URL';

  try {
    client = new Redis(redisUrl, createRedisOptions('healthcheck'));
    attachRedisNoiseGuard(client, 'healthcheck');

    const { latencyMs, value } = await withTiming(async () => {
      await client!.connect();
      await client!.ping();
      return client!.info('server');
    });

    const redisVersion = parseRedisVersion(value);
    const bullmqReady = redisSupportsBullMQ(redisVersion);

    return {
      key: 'redis',
      label: 'Redis',
      status: bullmqReady ? 'healthy' : 'degraded',
      detail: bullmqReady
        ? 'Queue/event cache reachable.'
        : `Redis reachable, but server version ${redisVersion || 'unknown'} is below BullMQ's Redis 5 minimum.`,
      latency_ms: latencyMs,
      meta: {
        url: redisUrl,
        redis_version: redisVersion,
        bullmq_ready: bullmqReady,
      },
      diagnostics: {
        why_degraded: bullmqReady ? null : `BullMQ workers require Redis 5+, but the current server reports ${redisVersion || 'an unknown version'}.`,
        env_source: envSource,
        effective_endpoint: redisUrl,
        suggested_remediation: buildRemediation(
          !bullmqReady && 'Upgrade local Redis to version 5 or newer before relying on BullMQ-backed worker execution.',
          !bullmqReady && 'Until then, direct fallback paths may work, but queue-worker launch readiness remains degraded.',
          bullmqReady && 'If live events or queues degrade, confirm the Redis service is running and that REDIS_URL targets the correct port.',
        ),
      },
    };
  } catch (error) {
    const lastError = error instanceof Error ? error.message : 'Redis check failed.';
    return {
      key: 'redis',
      label: 'Redis',
      status: 'down',
      detail: lastError,
      meta: {
        url: redisUrl,
      },
      diagnostics: {
        why_degraded: 'Redis pub/sub and queue state are unavailable.',
        last_error: lastError,
        env_source: envSource,
        effective_endpoint: redisUrl,
        suggested_remediation: buildRemediation('Start Redis or restore connectivity to the configured endpoint.', 'If this is local dev, confirm REDIS_URL matches the live Redis port, typically 127.0.0.1:6379.'),
      },
    };
  } finally {
    if (client) {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }
  }
}

async function checkEmbeddings(): Promise<RuntimeServiceSnapshot> {
  const ollamaBaseUrl = normalizeLoopbackUrl(process.env.OLLAMA_BASE_URL, DEFAULT_OLLAMA_BASE_URL);
  const embeddingModel = process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  const envSource = [
    process.env.OLLAMA_BASE_URL?.trim() ? 'OLLAMA_BASE_URL' : 'default Ollama URL',
    process.env.EMBEDDING_MODEL?.trim() ? 'EMBEDDING_MODEL' : 'default embedding model',
  ].join(' + ');

  try {
    const { latencyMs, value } = await withTiming(async () => {
      const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Ollama ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<{ models?: Array<{ name?: string; model?: string }> }>;
    });

    const availableModels = Array.isArray(value.models) ? value.models : [];
    const hasEmbeddingModel = availableModels.some((model) => {
      const name = model.name || model.model || '';
      return name === embeddingModel || name.startsWith(`${embeddingModel}:`);
    });

    return {
      key: 'embeddings',
      label: 'Ollama embeddings',
      status: hasEmbeddingModel ? 'healthy' : 'degraded',
      detail: hasEmbeddingModel
        ? `Embedding model ${embeddingModel} is available.`
        : `Ollama is reachable, but ${embeddingModel} is not currently loaded.`,
      latency_ms: latencyMs,
      meta: {
        base_url: ollamaBaseUrl,
        model: embeddingModel,
        model_count: availableModels.length,
      },
      diagnostics: {
        why_degraded: hasEmbeddingModel ? null : `Ollama responded, but the configured embedding model ${embeddingModel} is not loaded.`,
        env_source: envSource,
        effective_endpoint: `${ollamaBaseUrl}/api/tags`,
        suggested_remediation: buildRemediation(
          !hasEmbeddingModel && `Load or pull ${embeddingModel} into Ollama before relying on semantic search or embedding backfills.`,
          !hasEmbeddingModel && 'If a different model should be used, update EMBEDDING_MODEL to match the loaded Ollama catalog.',
        ),
      },
    };
  } catch (error) {
    const lastError = error instanceof Error ? error.message : 'Embedding service check failed.';
    return {
      key: 'embeddings',
      label: 'Ollama embeddings',
      status: 'down',
      detail: lastError,
      meta: {
        base_url: ollamaBaseUrl,
        model: embeddingModel,
      },
      diagnostics: {
        why_degraded: 'The Ollama embedding health probe could not reach the service.',
        last_error: lastError,
        env_source: envSource,
        effective_endpoint: `${ollamaBaseUrl}/api/tags`,
        suggested_remediation: buildRemediation('Start Ollama or correct OLLAMA_BASE_URL.', 'If embeddings are intentionally disabled, treat this as expected and ignore semantic search-related warnings.'),
      },
    };
  }
}

async function checkProviders(): Promise<RuntimeServiceSnapshot> {
  const inventory = getProviderInventory();
  const configuredProviders = inventory.filter((entry) => entry.configured);

  if (configuredProviders.length === 0) {
    return {
      key: 'providers',
      label: 'LLM providers',
      status: 'healthy',
      detail: 'No routed external providers are configured; local-only runtime mode is active.',
      meta: {
        configured_count: 0,
        total_count: inventory.length,
        operating_mode: 'local-only',
      },
      diagnostics: {
        why_degraded: null,
        env_source: 'provider credential env vars or fallback config accounts',
        effective_endpoint: null,
        suggested_remediation: buildRemediation(
          'This is expected for a local-only runtime.',
          'Configure at least one routed provider account or fallback provider key only if you want external model traffic enabled in this environment.',
        ),
      },
    };
  }

  try {
    const { latencyMs, value } = await withTiming(() => healthCheckProviders());
    const configuredProviderIds = new Set(configuredProviders.map((entry) => entry.provider_id));
    const configuredHealthEntries = Object.entries(value).filter(([providerId]) => configuredProviderIds.has(providerId));
    const onlineCount = configuredHealthEntries.filter(([, status]) => status.online).length;
    const offlineProviders = configuredHealthEntries
      .filter(([, status]) => !status.online)
      .map(([providerId]) => providerId);
    const drilldownItems: RuntimeServiceDrilldownItem[] = configuredProviders.map((provider) => {
      const providerHealth = value[provider.provider_id];
      const online = Boolean(providerHealth?.online);

      return {
        key: provider.provider_id,
        label: provider.provider_name,
        status: online ? 'healthy' : 'degraded',
        detail: online ? 'Provider health endpoint responded.' : providerHealth?.error || 'Provider unavailable during health probe.',
        why_degraded: online ? null : 'This configured provider did not respond successfully to the health probe.',
        last_error: providerHealth?.error || null,
        env_source: formatProviderEnvSource(provider.configured_env_names, provider.uses_fallback_config_account),
        effective_endpoint: `${provider.base_url}${provider.health_path}`,
      };
    });
    const offlineErrors = drilldownItems
      .filter((item) => item.last_error)
      .map((item) => `${item.label}: ${item.last_error}`);

    return {
      key: 'providers',
      label: 'LLM providers',
      status: onlineCount === configuredProviders.length ? 'healthy' : 'degraded',
      detail: onlineCount === configuredProviders.length
        ? `${onlineCount}/${configuredProviders.length} configured providers online.`
        : `${onlineCount}/${configuredProviders.length} configured providers online. Offline: ${offlineProviders.join(', ')}`,
      latency_ms: latencyMs,
      meta: {
        configured_count: configuredProviders.length,
        online_count: onlineCount,
      },
      diagnostics: {
        why_degraded: onlineCount === configuredProviders.length ? null : `Some configured providers are offline: ${offlineProviders.join(', ')}`,
        last_error: offlineErrors.length > 0 ? offlineErrors.join(' | ') : null,
        env_source: configuredProviders.map((provider) => formatProviderEnvSource(provider.configured_env_names, provider.uses_fallback_config_account)).join(' | '),
        effective_endpoint: configuredProviders.map((provider) => `${provider.provider_name}: ${provider.base_url}${provider.health_path}`).join(' | '),
        suggested_remediation: buildRemediation(
          onlineCount !== configuredProviders.length && 'Check the failing provider credential env vars or fallback config accounts.',
          onlineCount !== configuredProviders.length && 'Verify outbound connectivity to the provider health endpoints and confirm any rate-limit or auth failures.',
        ),
        drilldown_items: drilldownItems,
      },
    };
  } catch (error) {
    const lastError = error instanceof Error ? error.message : 'Provider health check failed.';
    return {
      key: 'providers',
      label: 'LLM providers',
      status: 'down',
      detail: lastError,
      meta: {
        configured_count: configuredProviders.length,
      },
      diagnostics: {
        why_degraded: 'The aggregate provider health sweep failed before all configured providers could be checked.',
        last_error: lastError,
        env_source: configuredProviders.map((provider) => formatProviderEnvSource(provider.configured_env_names, provider.uses_fallback_config_account)).join(' | '),
        effective_endpoint: configuredProviders.map((provider) => `${provider.provider_name}: ${provider.base_url}${provider.health_path}`).join(' | '),
        suggested_remediation: buildRemediation('Inspect provider auth configuration and outbound network reachability.', 'If one provider is noisy, check individual provider health routes and logs for the failing account.'),
      },
    };
  }
}

function checkFederationWritePath(): RuntimeServiceSnapshot {
  const config = getChatOverflowWriteConfig();
  const authSource = config.authSource === 'env' ? 'CHATOVERFLOW_WRITE_API_KEY' : config.authSource === 'chatoverflow-cli' ? 'chatoverflow-cli config' : 'not configured';
  const forumSource = process.env.CHATOVERFLOW_WRITE_FORUM_ID?.trim() ? 'CHATOVERFLOW_WRITE_FORUM_ID' : 'not configured';
  const apiBaseSource = process.env.CHATOVERFLOW_WRITE_API_BASE?.trim() ? 'CHATOVERFLOW_WRITE_API_BASE' : 'default ChatOverflow API base';

  if (!config.enabled) {
    return {
      key: 'federation-write',
      label: 'ChatOverflow write path',
      status: 'disabled',
      detail: 'Outbound federation is inactive until both write auth and target forum are configured.',
      meta: {
        auth_source: config.authSource,
        forum_id: config.forumId || null,
      },
      diagnostics: {
        why_degraded: 'Outbound federation is disabled because either write auth or the destination forum id is missing.',
        env_source: `${authSource} | ${forumSource} | ${apiBaseSource}`,
        effective_endpoint: config.apiBaseUrl,
        suggested_remediation: buildRemediation('Set CHATOVERFLOW_WRITE_FORUM_ID and either CHATOVERFLOW_WRITE_API_KEY or local chatoverflow CLI auth before expecting outbound cross-posting.'),
      },
    };
  }

  return {
    key: 'federation-write',
    label: 'ChatOverflow write path',
    status: 'healthy',
    detail: `Outbound federation ready via ${config.authSource}.`,
    meta: {
      auth_source: config.authSource,
      forum_id: config.forumId,
      api_base_url: config.apiBaseUrl,
    },
    diagnostics: {
      env_source: `${authSource} | ${forumSource} | ${apiBaseSource}`,
      effective_endpoint: config.apiBaseUrl,
      suggested_remediation: buildRemediation('If outbound federation fails later, validate the ChatOverflow API key, forum id, and API base URL against the live target.'),
    },
  };
}

export async function getAdminRuntimeStatus(): Promise<RuntimeStatusSnapshot> {
  const services = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkEmbeddings(),
    checkProviders(),
    Promise.resolve(checkFederationWritePath()),
  ]);

  services.forEach(syncRuntimeServiceEvent);

  const summary = services.reduce(
    (acc, service) => {
      acc[service.status] += 1;
      return acc;
    },
    {
      healthy: 0,
      degraded: 0,
      down: 0,
      disabled: 0,
    },
  );

  const overall_status: RuntimeStatusSnapshot['overall_status'] = services.some((service) => service.status === 'down')
    ? 'down'
    : services.some((service) => service.status === 'degraded')
      ? 'degraded'
      : 'healthy';

  return {
    refreshed_at: new Date().toISOString(),
    overall_status,
    summary,
    services,
  };
}