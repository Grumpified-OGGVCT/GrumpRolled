import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  verifiedPattern: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  adminActionLog: {
    create: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/progression-sync', () => ({
  syncAgentProgression: vi.fn().mockResolvedValue(null),
}));

describe('/api/v1/knowledge/patterns/[id]/promote route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = 'admin-secret';
  });

  it('verifies without auto-publishing', async () => {
    dbMock.verifiedPattern.findUnique.mockResolvedValue({
      id: 'pattern-1',
      validationStatus: 'PENDING',
      confidence: 0.91,
      sourceTier: 'A',
      publishedAt: null,
    });
    dbMock.verifiedPattern.update.mockResolvedValue({
      id: 'pattern-1',
      validationStatus: 'VERIFIED',
      confidence: 0.91,
      sourceTier: 'A',
      publishedAt: null,
    });

    const { POST } = await import('../../src/app/api/v1/knowledge/patterns/[id]/promote/route');
    const response = await POST(
      {
        headers: new Headers([['x-admin-key', 'admin-secret']]),
        json: async () => ({ action: 'verify' }),
      } as never,
      { params: Promise.resolve({ id: 'pattern-1' }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.validation_status).toBe('VERIFIED');
    expect(body.publishable).toBe(false);
    expect(body.published_at).toBeNull();
    expect(body.publish_gate).toBe('ready_for_publish_action');
  });

  it('blocks publish before verification', async () => {
    dbMock.verifiedPattern.findUnique.mockResolvedValue({
      id: 'pattern-1',
      validationStatus: 'PENDING',
      confidence: 0.91,
      sourceTier: 'A',
      publishedAt: null,
    });

    const { POST } = await import('../../src/app/api/v1/knowledge/patterns/[id]/promote/route');
    const response = await POST(
      {
        headers: new Headers([['x-admin-key', 'admin-secret']]),
        json: async () => ({ action: 'publish' }),
      } as never,
      { params: Promise.resolve({ id: 'pattern-1' }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Pattern must be VERIFIED before publication.',
    });
  });

  it('publishes only after verification passes the confidence gate', async () => {
    const publishedAt = new Date('2026-04-01T02:00:00.000Z');
    dbMock.verifiedPattern.findUnique.mockResolvedValue({
      id: 'pattern-1',
      validationStatus: 'VERIFIED',
      confidence: 0.91,
      sourceTier: 'A',
      publishedAt: null,
    });
    dbMock.verifiedPattern.update.mockResolvedValue({
      id: 'pattern-1',
      validationStatus: 'VERIFIED',
      confidence: 0.91,
      sourceTier: 'A',
      publishedAt,
    });

    const { POST } = await import('../../src/app/api/v1/knowledge/patterns/[id]/promote/route');
    const response = await POST(
      {
        headers: new Headers([['x-admin-key', 'admin-secret']]),
        json: async () => ({ action: 'publish' }),
      } as never,
      { params: Promise.resolve({ id: 'pattern-1' }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.publishable).toBe(true);
    expect(body.published_at).toBe('2026-04-01T02:00:00.000Z');
    expect(dbMock.adminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PATTERN_PUBLISH',
        }),
      })
    );
  });
});