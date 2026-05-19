import { beforeEach, describe, expect, it, vi } from 'vitest';

const performKnowledgeSearchMock = vi.fn();
const getGovernanceSnapshotMock = vi.fn();

vi.mock('@/lib/knowledge-api', () => ({
  performKnowledgeSearch: performKnowledgeSearchMock,
  getGovernanceSnapshot: getGovernanceSnapshotMock,
}));

describe('knowledge and governance routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    performKnowledgeSearchMock.mockResolvedValue([
      { id: 'pattern-1', title: 'Agent pattern', source: 'agent-knowledge', relevanceScore: 0.91, url: '/knowledge/patterns/pattern-1' },
    ]);
    getGovernanceSnapshotMock.mockResolvedValue({
      tiers: ['hearth', 'forge', 'sovereign'],
      manifest: { rule_count: 12 },
      operator_signals: { available: false },
      operational_backlog: { open_reports: 3 },
    });
  });

  it('routes rag-search POST to the shared knowledge search helper', async () => {
    const { POST } = await import('../../src/app/api/v1/knowledge/rag-search/route');
    const response = await POST({ json: async () => ({ query: 'agent patterns', limit: 5, filters: { sourceType: 'agent-knowledge' } }) } as never);
    const body = await response.json();

    expect(performKnowledgeSearchMock).toHaveBeenCalledWith({
      query: 'agent patterns',
      limit: 5,
      filters: { sourceType: 'agent-knowledge' },
    });
    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
  });

  it('routes infinite-rag POST to the shared knowledge search helper in infinite mode', async () => {
    const { POST } = await import('../../src/app/api/v1/knowledge/infinite-rag/route');
    const response = await POST({ json: async () => ({ query: 'governance', limit: 12, filters: { sourceType: 'documentation' } }) } as never);
    const body = await response.json();

    expect(performKnowledgeSearchMock).toHaveBeenCalledWith({
      query: 'governance',
      limit: 12,
      infinite: true,
      filters: { sourceType: 'documentation' },
    });
    expect(body.scope).toBe('infinite-rag');
  });

  it('returns 400 when the shared knowledge helper rejects the request', async () => {
    performKnowledgeSearchMock.mockRejectedValueOnce(new Error('query is required'));

    const { POST } = await import('../../src/app/api/v1/knowledge/rag-search/route');
    const response = await POST({ json: async () => ({ query: '' }) } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'query is required' });
  });

  it('returns the governance snapshot from the shared helper', async () => {
    const { GET } = await import('../../src/app/api/v1/governance/route');
    const response = await GET();
    const body = await response.json();

    expect(getGovernanceSnapshotMock).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(body.tiers).toEqual(['hearth', 'forge', 'sovereign']);
    expect(body.operational_backlog.open_reports).toBe(3);
  });
});
