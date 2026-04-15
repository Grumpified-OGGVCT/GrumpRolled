import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  antiPoisonLog: { findMany: vi.fn() },
  adminActionLog: { findMany: vi.fn() },
};

const isAdminRequestMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/admin', () => ({
  isAdminRequest: isAdminRequestMock,
}));

describe('/api/v1/admin/content-blocks route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dbMock.adminActionLog.findMany.mockResolvedValue([]);
  });

  it('rejects non-admin requests', async () => {
    isAdminRequestMock.mockReturnValue(false);

    const { GET } = await import('../../src/app/api/v1/admin/content-blocks/route');
    const response = await GET(new Request('http://localhost/api/v1/admin/content-blocks') as never);

    expect(response.status).toBe(403);
  });

  it('returns parsed content block entries with grouped summary', async () => {
    isAdminRequestMock.mockReturnValue(true);
    dbMock.antiPoisonLog.findMany.mockResolvedValue([
      {
        id: 'block-1',
        action: 'BLOCKED_SELF_EXPRESSION',
        contentType: 'GRUMP',
        contentId: 'grump-1',
        agentId: 'agent-1',
        riskScore: 0.6,
        reason: 'USER_SPECIFIC_FRAMING,IDENTIFYING_DETAIL | User-specific framing detected; Identifying person or organization detail detected',
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
      },
      {
        id: 'block-2',
        action: 'BLOCKED_POISON',
        contentType: 'QUESTION',
        contentId: null,
        agentId: 'agent-2',
        riskScore: 0.9,
        reason: 'API_SECRET | Potential API secret detected',
        createdAt: new Date('2026-04-03T01:00:00.000Z'),
      },
    ]);

    const { GET } = await import('../../src/app/api/v1/admin/content-blocks/route');
    const response = await GET(new Request('http://localhost/api/v1/admin/content-blocks?limit=10') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.query.window).toBe('24h');
    expect(body.summary).toEqual({
      total: 2,
      poison: 1,
      self_expression: 1,
      other: 0,
    });
    expect(body.decision_summary).toEqual({
      dismissed: { count: 0, last_at: null },
      reviewed: { count: 0, last_at: null },
      escalated: { count: 0, last_at: null },
    });
    expect(body.review_queue).toEqual([]);
    expect(body.blocks[0]).toMatchObject({
      id: 'block-1',
      kind: 'self_expression',
      codes: ['USER_SPECIFIC_FRAMING', 'IDENTIFYING_DETAIL'],
    });
    expect(body.blocks[1]).toMatchObject({
      id: 'block-2',
      kind: 'poison',
      codes: ['API_SECRET'],
    });
  });

  it('groups repeated pending self-expression blocks into a review queue', async () => {
    isAdminRequestMock.mockReturnValue(true);
    dbMock.antiPoisonLog.findMany.mockResolvedValue([
      {
        id: 'block-1',
        action: 'BLOCKED_SELF_EXPRESSION',
        contentType: 'GRUMP',
        contentId: null,
        agentId: 'agent-1',
        riskScore: 0.6,
        reason: 'USER_SPECIFIC_FRAMING | User-specific framing detected',
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
      },
      {
        id: 'block-2',
        action: 'BLOCKED_SELF_EXPRESSION',
        contentType: 'ANSWER',
        contentId: null,
        agentId: 'agent-2',
        riskScore: 0.8,
        reason: 'USER_SPECIFIC_FRAMING | User-specific framing detected',
        createdAt: new Date('2026-04-03T02:00:00.000Z'),
      },
    ]);

    const { GET } = await import('../../src/app/api/v1/admin/content-blocks/route');
    const response = await GET(new Request('http://localhost/api/v1/admin/content-blocks?limit=10') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.review_queue).toHaveLength(1);
    expect(body.review_queue[0]).toMatchObject({
      count: 2,
      codes: ['USER_SPECIFIC_FRAMING'],
      summary: 'User-specific framing detected',
    });
  });

  it('returns decision summaries and csv exports for moderation history', async () => {
    isAdminRequestMock.mockReturnValue(true);
    dbMock.antiPoisonLog.findMany.mockResolvedValue([]);
    dbMock.adminActionLog.findMany.mockResolvedValue([
      {
        id: 'admin-1',
        action: 'SELF_EXPRESSION_DISMISS',
        metadata: JSON.stringify({ decision: 'dismiss', summary: 'Generalized story', note: 'Benign after review.', codes: ['USER_SPECIFIC_FRAMING'] }),
        createdAt: new Date('2026-04-03T04:00:00.000Z'),
      },
      {
        id: 'admin-2',
        action: 'SELF_EXPRESSION_POLICY_ESCALATE',
        metadata: JSON.stringify({ decision: 'policy_escalate', summary: 'Repeated sensitive pattern', note: 'Needs policy update.', codes: ['USER_SPECIFIC_FRAMING'] }),
        createdAt: new Date('2026-04-03T05:00:00.000Z'),
      },
    ]);

    const { GET } = await import('../../src/app/api/v1/admin/content-blocks/route');
    const jsonResponse = await GET(new Request('http://localhost/api/v1/admin/content-blocks?limit=10') as never);
    const jsonBody = await jsonResponse.json();

    expect(jsonBody.decision_summary).toEqual({
      dismissed: { count: 1, last_at: '2026-04-03T04:00:00.000Z' },
      reviewed: { count: 0, last_at: null },
      escalated: { count: 1, last_at: '2026-04-03T05:00:00.000Z' },
    });

    const csvResponse = await GET(new Request('http://localhost/api/v1/admin/content-blocks?format=csv&window=24h') as never);
    const csvText = await csvResponse.text();

    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get('Content-Type')).toContain('text/csv');
    expect(csvText).toContain('SELF_EXPRESSION_DISMISS');
    expect(csvText).toContain('Benign after review.');
  });

  it('applies the selected moderation window to blocked-content queries', async () => {
    isAdminRequestMock.mockReturnValue(true);
    dbMock.antiPoisonLog.findMany.mockResolvedValue([]);
    dbMock.adminActionLog.findMany.mockResolvedValue([]);

    const { GET } = await import('../../src/app/api/v1/admin/content-blocks/route');
    const response = await GET(new Request('http://localhost/api/v1/admin/content-blocks?limit=10&window=7d') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.query.window).toBe('7d');
    expect(dbMock.antiPoisonLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.any(Object),
        }),
      })
    );
  });
});