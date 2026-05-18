import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscribeToEventsMock = vi.fn();

vi.mock('@/lib/events', () => ({
  subscribeToEvents: subscribeToEventsMock,
}));

describe('/api/v1/events route', () => {
  async function readInitialChunks(response: Response, chunkCount = 2) {
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    let decoded = '';
    for (let index = 0; index < chunkCount; index += 1) {
      const chunk = await reader!.read();
      decoded += new TextDecoder().decode(chunk.value || new Uint8Array());
      if (chunk.done) break;
    }

    await reader!.cancel();
    return decoded;
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('keeps the SSE stream open in heartbeat-only mode when Redis subscription fails', async () => {
    subscribeToEventsMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'));

    const { GET } = await import('../../src/app/api/v1/events/route');
    const request = {
      url: 'http://127.0.0.1:4692/api/v1/events?types=notification',
      signal: new AbortController().signal,
    } as never;

    const response = await GET(request);
    const body = await readInitialChunks(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    expect(body).toContain(':ok');
    expect(body).toContain('event: disabled');
    expect(body).toContain('"reason":"redis_unavailable"');
  });

  it('subscribes normally and emits a ready frame when Redis is available', async () => {
    subscribeToEventsMock.mockResolvedValue({
      onEvent: vi.fn(),
      unsubscribe: vi.fn(async () => undefined),
    });

    const { GET } = await import('../../src/app/api/v1/events/route');
    const request = {
      url: 'http://127.0.0.1:4692/api/v1/events?types=notification,reputation:changed',
      signal: new AbortController().signal,
    } as never;

    const response = await GET(request);
    const body = await readInitialChunks(response);

    expect(response.status).toBe(200);
    expect(subscribeToEventsMock).toHaveBeenCalledWith(
      ['notification', 'reputation:changed'],
      expect.any(Function),
    );
    expect(body).toContain('event: ready');
    expect(body).toContain('"mode":"live"');
  });
});