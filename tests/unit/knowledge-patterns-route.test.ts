import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticateAgentMock = vi.fn();

const dbMock = {
  verifiedPattern: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/auth', () => ({
  authenticateAgentRequest: authenticateAgentMock,
}));

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/progression-sync', () => ({
  syncAgentProgression: vi.fn().mockResolvedValue(null),
}));

describe('/api/v1/knowledge/patterns route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    authenticateAgentMock.mockResolvedValue({ id: 'agent-1', username: 'tester' });
  });

  it('creates draft-only pattern submissions even when VERIFIED is requested', async () => {
    dbMock.verifiedPattern.create.mockResolvedValue({
      id: 'pattern-1',
      validationStatus: 'PENDING',
      sourceTier: 'A',
      confidence: 0.92,
    });

    const { POST } = await import('../../src/app/api/v1/knowledge/patterns/route');
    const response = await POST({
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? 'Bearer ok' : null),
      },
      json: async () => ({
        title: 'Reliable agent coordination workflow',
        description: 'A long enough description to satisfy the validation boundary for draft creation.',
        validation_status: 'VERIFIED',
        source_repo: 'grumpified/HLF_MCP',
        fact_check_score: 1,
        execution_score: 1,
        citation_score: 1,
        expert_score: 1,
        community_score: 1,
      }),
    } as never);

    expect(response.status).toBe(201);
    const body = await response.json();

    expect(body.validation_status).toBe('PENDING');
    expect(body.review_recommended).toBe(true);
    expect(body.publishable).toBe(false);
    expect(dbMock.verifiedPattern.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          validationStatus: 'PENDING',
        }),
      })
    );
  });

  it('lists only explicitly published verified patterns by default', async () => {
    dbMock.verifiedPattern.findMany.mockResolvedValue([
      {
        id: 'pattern-1',
        title: 'Published pattern',
        description: 'Published description long enough to appear in the public lane.',
        patternType: 'WORKFLOW',
        category: 'coding',
        tags: JSON.stringify(['published']),
        sourceTier: 'A',
        validationStatus: 'VERIFIED',
        confidence: 0.88,
        publishedAt: new Date('2026-04-01T00:00:00.000Z'),
        deprecatedAt: null,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        author: { username: 'tester', displayName: 'Tester', repScore: 10 },
      },
    ]);

    const { GET } = await import('../../src/app/api/v1/knowledge/patterns/route');
    const response = await GET({
      url: 'http://localhost:3000/api/v1/knowledge/patterns',
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(dbMock.verifiedPattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          validationStatus: 'VERIFIED',
          publishedAt: { not: null },
        }),
      })
    );
    expect(body.patterns[0].publishable).toBe(true);
    expect(body.patterns[0].published_at).toBe('2026-04-01T00:00:00.000Z');
  });
});