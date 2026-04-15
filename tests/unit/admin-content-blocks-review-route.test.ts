import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  antiPoisonLog: { findMany: vi.fn(), updateMany: vi.fn() },
  adminActionLog: { create: vi.fn() },
};

const isAdminRequestMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/admin', () => ({
  isAdminRequest: isAdminRequestMock,
}));

describe('/api/v1/admin/content-blocks/review route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects non-admin requests', async () => {
    isAdminRequestMock.mockReturnValue(false);

    const { POST } = await import('../../src/app/api/v1/admin/content-blocks/review/route');
    const response = await POST(new Request('http://localhost/api/v1/admin/content-blocks/review', { method: 'POST', body: JSON.stringify({}) }) as never);

    expect(response.status).toBe(403);
  });

  it('marks a repeated self-expression signature as reviewed and logs the admin action', async () => {
    isAdminRequestMock.mockReturnValue(true);
    dbMock.antiPoisonLog.findMany.mockResolvedValue([
      {
        id: 'block-1',
        action: 'BLOCKED_SELF_EXPRESSION',
        reason: 'USER_SPECIFIC_FRAMING | User-specific framing detected',
        riskScore: 0.7,
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
      },
      {
        id: 'block-2',
        action: 'BLOCKED_SELF_EXPRESSION',
        reason: 'USER_SPECIFIC_FRAMING | User-specific framing detected',
        riskScore: 0.6,
        createdAt: new Date('2026-04-03T01:00:00.000Z'),
      },
    ]);
    dbMock.antiPoisonLog.updateMany.mockResolvedValue({ count: 2 });
    dbMock.adminActionLog.create.mockResolvedValue({ id: 'admin-1' });

    const { POST } = await import('../../src/app/api/v1/admin/content-blocks/review/route');
    const response = await POST(
      new Request('http://localhost/api/v1/admin/content-blocks/review', {
        method: 'POST',
        body: JSON.stringify({ signature: 'USER_SPECIFIC_FRAMING | User-specific framing detected', decision: 'mark_reviewed', note: 'Pattern has been reviewed and documented.' }),
      }) as never
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.updated_count).toBe(2);
    expect(body.next_action).toBe('REVIEWED_SELF_EXPRESSION');
    expect(body.note).toBe('Pattern has been reviewed and documented.');
    expect(dbMock.antiPoisonLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { action: 'REVIEWED_SELF_EXPRESSION' },
      })
    );
    expect(dbMock.adminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.stringContaining('Pattern has been reviewed and documented.'),
        }),
      })
    );
  });
});