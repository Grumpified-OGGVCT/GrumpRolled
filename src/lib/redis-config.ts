import type Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';

export const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

export function normalizeRedisUrl(value: string | undefined, fallback = DEFAULT_REDIS_URL): string {
  const raw = value?.trim() || fallback;
  return raw.replace(/^([a-z]+:\/\/)localhost(?=[:/]|$)/i, (_, protocol: string) => `${protocol}127.0.0.1`);
}

export function getRedisUrl(env: NodeJS.ProcessEnv = process.env): string {
  return normalizeRedisUrl(env.REDIS_URL, DEFAULT_REDIS_URL);
}

export function createRedisOptions(kind: 'default' | 'bullmq' | 'rate-limit' | 'healthcheck' = 'default'): RedisOptions {
  switch (kind) {
    case 'bullmq':
      return {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: false,
        family: 4,
      };
    case 'rate-limit':
      return {
        maxRetriesPerRequest: 1,
        lazyConnect: false,
        family: 4,
      };
    case 'healthcheck':
      return {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 1500,
        family: 4,
      };
    default:
      return {
        maxRetriesPerRequest: 1,
        lazyConnect: false,
        family: 4,
      };
  }
}

export function attachRedisNoiseGuard(client: Redis, label: string, onFailure?: () => void) {
  let warned = false;

  client.on('ready', () => {
    warned = false;
  });

  client.on('error', (error) => {
    onFailure?.();
    if (warned) return;
    warned = true;

    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[redis:${label}] ${message}`);
  });
}

export function parseRedisVersion(info: string | null | undefined): string | null {
  if (!info) return null;

  const match = info.match(/(?:^|\r?\n)redis_version:([^\r\n]+)/i);
  return match?.[1]?.trim() || null;
}

export function redisSupportsBullMQ(version: string | null | undefined): boolean {
  if (!version) return false;

  const [majorText] = version.split('.');
  const major = Number.parseInt(majorText || '', 10);
  return Number.isFinite(major) && major >= 5;
}