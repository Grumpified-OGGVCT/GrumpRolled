import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequestMock = vi.fn();
const getLaunchReadinessSnapshotMock = vi.fn();

vi.mock('@/lib/admin', () => ({
  isAdminRequest: isAdminRequestMock,
}));

vi.mock('@/lib/launch-readiness', () => ({
  getLaunchReadinessSnapshot: getLaunchReadinessSnapshotMock,
}));

describe('/api/v1/admin/launch-readiness route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects non-admin requests', async () => {
    isAdminRequestMock.mockReturnValue(false);

    const { GET } = await import('../../src/app/api/v1/admin/launch-readiness/route');
    const response = await GET({ headers: new Headers() } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(getLaunchReadinessSnapshotMock).not.toHaveBeenCalled();
  });

  it('returns a blocked launch-readiness snapshot for admin requests', async () => {
    isAdminRequestMock.mockReturnValue(true);
    getLaunchReadinessSnapshotMock.mockResolvedValue({
      generated_at: '2026-05-19T00:00:00.000Z',
      ready: false,
      summary: { pass: 2, warn: 1, fail: 2 },
      checks: [
        { key: 'redis-bullmq', label: 'Redis BullMQ readiness', status: 'fail', detail: 'Redis too old.' },
      ],
      worker_health: null,
      failure_counters: [{ key: 'worker:background-worker:startup_failures', count: 2, last_error: 'Redis too old.', last_at: '2026-05-19T00:00:00.000Z' }],
      release_gate: { blocking: ['Redis BullMQ readiness'], warnings: ['Background worker heartbeat'] },
    });

    const { GET } = await import('../../src/app/api/v1/admin/launch-readiness/route');
    const response = await GET({ headers: new Headers([['x-admin-key', 'ok']]) } as never);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.scope).toBe('admin-launch-readiness');
    expect(body.snapshot.ready).toBe(false);
    expect(body.snapshot.release_gate.blocking).toContain('Redis BullMQ readiness');
    expect(getLaunchReadinessSnapshotMock).toHaveBeenCalledTimes(1);
  });
});