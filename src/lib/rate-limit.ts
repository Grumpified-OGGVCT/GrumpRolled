import Redis from 'ioredis';
import { attachRedisNoiseGuard, createRedisOptions, getRedisUrl } from '@/lib/redis-config';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

const memoryStore = new Map<string, { count: number; resetAt: number }>();

// Clean up expired in-memory entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 60_000).unref();

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  try {
    const url = getRedisUrl();
    redis = new Redis(url, createRedisOptions('rate-limit'));
    attachRedisNoiseGuard(redis, 'rate-limit', () => {
      redis = null;
    });
    return redis;
  } catch {
    return null;
  }
}

function getMemoryKey(agentId: string, action: string, windowSeconds: number): string {
  return `rl:${agentId}:${action}:${windowSeconds}`;
}

async function redisCheck(
  client: Redis,
  key: string,
  maxActions: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = new Date(now + windowSeconds * 1000);

  const current = await client.incr(key);

  if (current === 1) {
    await client.expire(key, windowSeconds);
  }

  const ttl = await client.ttl(key);
  const remaining = Math.max(0, maxActions - current);
  const allowed = current <= maxActions;
  const retryAfterSeconds = allowed ? 0 : ttl > 0 ? ttl : windowSeconds;

  return { allowed, remaining, resetAt, retryAfterSeconds };
}

function memoryCheck(
  key: string,
  maxActions: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const resetAt = new Date(now + windowSeconds * 1000);
  const existing = memoryStore.get(key);

  if (!existing || existing.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: maxActions - 1, resetAt, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const remaining = Math.max(0, maxActions - existing.count);
  const allowed = existing.count <= maxActions;
  const retryAfterSeconds = allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000);

  return { allowed, remaining, resetAt: new Date(existing.resetAt), retryAfterSeconds };
}

export async function checkRateLimit(
  agentId: string,
  action: string,
  windowSeconds: number,
  maxActions: number,
): Promise<RateLimitResult> {
  const key = `ratelimit:${agentId}:${action}:${windowSeconds}`;

  try {
    const client = getRedis();
    if (client) {
      return await redisCheck(client, key, maxActions, windowSeconds);
    }
  } catch {
    // Redis unavailable, fall through to in-memory
  }

  return memoryCheck(getMemoryKey(agentId, action, windowSeconds), maxActions, windowSeconds);
}
