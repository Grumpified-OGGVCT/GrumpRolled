import Redis from 'ioredis';

import { getChatOverflowWriteConfig } from '@/lib/cross-post';
import { db } from '@/lib/db';
import { getProviderInventory, healthCheckProviders } from '@/lib/llm-provider-router';
import { attachRedisNoiseGuard, createRedisOptions, getRedisUrl } from '@/lib/redis-config';

export type RuntimeServiceStatus = 'healthy' | 'degraded' | 'down' | 'disabled';

export interface RuntimeServiceSnapshot {
  key: string;
  label: string;
  status: RuntimeServiceStatus;
  detail: string;
  latency_ms?: number;
  meta?: Record<string, string | number | boolean | null>;
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

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';

function normalizeLoopbackUrl(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  return raw.replace(/^([a-z]+:\/\/)localhost(?=[:/]|$)/i, (_, protocol: string) => `${protocol}127.0.0.1`);
}

async function withTiming<T>(fn: () => Promise<T>): Promise<{ latencyMs: number; value: T }> {
  const startedAt = Date.now();
  const value = await fn();
  return { latencyMs: Date.now() - startedAt, value };
}

async function checkDatabase(): Promise<RuntimeServiceSnapshot> {
  try {
    const { latencyMs } = await withTiming(() => db.$queryRaw`SELECT 1`);
    return {
      key: 'database',
      label: 'Postgres',
      status: 'healthy',
      detail: 'Primary application database reachable.',
      latency_ms: latencyMs,
    };
  } catch (error) {
    return {
      key: 'database',
      label: 'Postgres',
      status: 'down',
      detail: error instanceof Error ? error.message : 'Database check failed.',
    };
  }
}

async function checkRedis(): Promise<RuntimeServiceSnapshot> {
  const redisUrl = getRedisUrl();
  let client: Redis | null = null;

  try {
    client = new Redis(redisUrl, createRedisOptions('healthcheck'));
    attachRedisNoiseGuard(client, 'healthcheck');

    const { latencyMs } = await withTiming(async () => {
      await client!.connect();
      await client!.ping();
    });

    return {
      key: 'redis',
      label: 'Redis',
      status: 'healthy',
      detail: 'Queue/event cache reachable.',
      latency_ms: latencyMs,
      meta: {
        url: redisUrl,
      },
    };
  } catch (error) {
    return {
      key: 'redis',
      label: 'Redis',
      status: 'down',
      detail: error instanceof Error ? error.message : 'Redis check failed.',
      meta: {
        url: redisUrl,
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
    };
  } catch (error) {
    return {
      key: 'embeddings',
      label: 'Ollama embeddings',
      status: 'down',
      detail: error instanceof Error ? error.message : 'Embedding service check failed.',
      meta: {
        base_url: ollamaBaseUrl,
        model: embeddingModel,
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
      status: 'disabled',
      detail: 'No routed external providers are configured in env.',
      meta: {
        configured_count: 0,
        total_count: inventory.length,
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
    };
  } catch (error) {
    return {
      key: 'providers',
      label: 'LLM providers',
      status: 'down',
      detail: error instanceof Error ? error.message : 'Provider health check failed.',
      meta: {
        configured_count: configuredProviders.length,
      },
    };
  }
}

function checkFederationWritePath(): RuntimeServiceSnapshot {
  const config = getChatOverflowWriteConfig();

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