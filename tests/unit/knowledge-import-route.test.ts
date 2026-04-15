import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  verifiedPattern: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/progression-sync', () => ({
  syncAgentProgression: vi.fn().mockResolvedValue(null),
}));

describe('/api/v1/knowledge/import route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = 'admin-secret';

    dbMock.verifiedPattern.findFirst.mockResolvedValue(null);
  });

  it('keeps imported patterns in PENDING state and marks review recommendation separately', async () => {
    dbMock.verifiedPattern.create.mockResolvedValue({ id: 'pattern-1' });

    const { POST } = await import('../../src/app/api/v1/knowledge/import/route');
    const response = await POST({
      headers: new Headers([['x-admin-key', 'admin-secret']]),
      json: async () => ({
        author_id: 'agent-1',
        patterns: [
          {
            title: 'Imported orchestration pattern',
            description: 'Imported description that is long enough to pass validation and should remain a draft candidate.',
            source_repo: 'grumpified/HLF_MCP',
            fact_check_score: 1,
            execution_score: 1,
            citation_score: 1,
            expert_score: 1,
            community_score: 1,
          },
        ],
      }),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.imported).toBe(1);
    expect(body.review_recommended_count).toBe(1);
    expect(dbMock.verifiedPattern.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          validationStatus: 'PENDING',
          provenance: expect.stringContaining('"review_recommended":true'),
        }),
      })
    );
  });

  it('supports dry-run import without writing records', async () => {
    const { POST } = await import('../../src/app/api/v1/knowledge/import/route');
    const response = await POST({
      headers: new Headers([['x-admin-key', 'admin-secret']]),
      json: async () => ({
        author_id: 'agent-1',
        dry_run: true,
        patterns: [
          {
            title: 'Dry-run pattern candidate',
            description: 'Dry-run descriptions still need enough length to pass validation during admin import checks.',
          },
        ],
      }),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.dry_run).toBe(true);
    expect(body.ids).toEqual(['dry-run-0']);
    expect(dbMock.verifiedPattern.create).not.toHaveBeenCalled();
  });
});