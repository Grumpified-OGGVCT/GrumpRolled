import { describe, expect, it } from 'vitest';

import { DEFAULT_REDIS_URL, getRedisUrl, normalizeRedisUrl } from '../../src/lib/redis-config';

describe('redis-config', () => {
  it('normalizes localhost redis URLs to 127.0.0.1', () => {
    expect(normalizeRedisUrl('redis://localhost:6379')).toBe('redis://127.0.0.1:6379');
    expect(normalizeRedisUrl('rediss://localhost:6380')).toBe('rediss://127.0.0.1:6380');
  });

  it('falls back to the default redis URL when env is missing', () => {
    expect(getRedisUrl({} as NodeJS.ProcessEnv)).toBe(DEFAULT_REDIS_URL);
  });

  it('preserves explicit non-localhost redis hosts', () => {
    expect(getRedisUrl({ REDIS_URL: 'redis://cache.internal:6379' } as NodeJS.ProcessEnv)).toBe('redis://cache.internal:6379');
  });
});