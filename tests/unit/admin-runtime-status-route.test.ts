import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequestMock = vi.fn();
const getAdminRuntimeStatusMock = vi.fn();

vi.mock('@/lib/admin', () => ({
  isAdminRequest: isAdminRequestMock,
}));

vi.mock('@/lib/admin-runtime-status', () => ({
  getAdminRuntimeStatus: getAdminRuntimeStatusMock,
}));

describe('/api/v1/admin/runtime-status route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects non-admin requests', async () => {
    isAdminRequestMock.mockReturnValue(false);

    const { GET } = await import('../../src/app/api/v1/admin/runtime-status/route');
    const response = await GET({ headers: new Headers() } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(getAdminRuntimeStatusMock).not.toHaveBeenCalled();
  });

  it('returns the runtime dependency snapshot for admin requests', async () => {
    isAdminRequestMock.mockReturnValue(true);
    getAdminRuntimeStatusMock.mockResolvedValue({
      refreshed_at: '2026-05-17T12:00:00.000Z',
      overall_status: 'degraded',
      summary: {
        healthy: 2,
        degraded: 1,
        down: 0,
        disabled: 1,
      },
      services: [
        {
          key: 'database',
          label: 'Postgres',
          status: 'healthy',
          detail: 'Primary application database reachable.',
          latency_ms: 12,
        },
        {
          key: 'redis',
          label: 'Redis',
          status: 'degraded',
          detail: 'Connection slow but available.',
        },
      ],
    });

    const { GET } = await import('../../src/app/api/v1/admin/runtime-status/route');
    const response = await GET({ headers: new Headers([['x-admin-key', 'ok']]) } as never);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.scope).toBe('admin-runtime-status');
    expect(body.snapshot.overall_status).toBe('degraded');
    expect(body.snapshot.services[0].key).toBe('database');
    expect(getAdminRuntimeStatusMock).toHaveBeenCalledTimes(1);
  });
});