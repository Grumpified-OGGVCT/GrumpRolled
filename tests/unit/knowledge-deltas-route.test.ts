import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  knowledgeDelta: {
    findUnique: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

describe('/api/v1/knowledge/deltas routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = 'admin-secret';
    dbMock.knowledgeDelta.findUnique.mockResolvedValue(null);
  });

  it('imports valid knowledge delta items and preserves run metadata', async () => {
    dbMock.knowledgeDelta.create.mockResolvedValue({ id: 'delta-1' });

    const { POST } = await import('../../src/app/api/v1/knowledge/deltas/import/route');
    const response = await POST({
      headers: new Headers([['x-admin-key', 'admin-secret']]),
      json: async () => ({
        author_id: 'agent-1',
        run_id: 'nightly-1',
        source_family: 'broad-ai-programming',
        generator: 'idea-vault-v2',
        items: [
          {
            title: 'Execution-verified reasoning loop',
            source_kind: 'PAPER',
            source_url: 'https://example.com/paper',
            primary_mechanism: 'Use execution feedback to validate intermediate reasoning steps before promotion.',
            delta_check: {
              status: 'CORRECTION',
              delta_summary: 'Adds executable verification instead of prose-only confidence.',
            },
            rules_and_constraints: {
              logic_gates: ['If execution fails, block promotion.'],
              dependencies: ['Sandbox runner'],
              failure_modes: ['False pass from weak tests'],
            },
            topic_tags: ['reasoning', 'verification'],
            forums: ['AI Research', 'coding'],
            decision_recommendation: 'POST_CORRECTIVE_REPLY',
          },
        ],
      }),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.imported).toBe(1);
    expect(body.run_id).toBe('nightly-1');
    expect(body.source_family).toBe('broad-ai-programming');
    expect(body.generator).toBe('idea-vault-v2');
    expect(dbMock.knowledgeDelta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: 'agent-1',
          runId: 'nightly-1',
          sourceFamily: 'broad-ai-programming',
          generatorLabel: 'idea-vault-v2',
          deltaClass: 'CORRECTION',
          decisionRecommendation: 'POST_CORRECTIVE_REPLY',
          status: 'INGESTED',
        }),
      })
    );
  });

  it('lists knowledge deltas with parsed JSON fields', async () => {
    dbMock.knowledgeDelta.findMany.mockResolvedValue([
      {
        id: 'delta-1',
        runId: 'nightly-1',
        sourceFamily: 'broad-ai-programming',
        generatorLabel: 'idea-vault-v2',
        sourceTitle: 'Execution-verified reasoning loop',
        sourceKind: 'PAPER',
        sourceUrl: 'https://example.com/paper',
        sourceRepo: null,
        sourcePath: null,
        sourceCommit: null,
        sourcePublishedAt: new Date('2026-04-02T00:00:00.000Z'),
        sourceFingerprint: 'sha256:test',
        sourceTier: 'B',
        primaryMechanism: 'Use execution feedback to validate intermediate reasoning steps before promotion.',
        deltaClass: 'CORRECTION',
        deltaSummary: 'Adds executable verification instead of prose-only confidence.',
        deltaMagnitude: 0.7,
        confidence: 0.78,
        confidenceShift: 0.15,
        forumRecommendation: 'AI Research',
        decisionRecommendation: 'POST_CORRECTIVE_REPLY',
        status: 'INGESTED',
        targetPatternId: null,
        targetKnowledgeArticleId: null,
        targetGrumpId: null,
        targetReplyId: null,
        topicTags: JSON.stringify(['reasoning', 'verification']),
        recommendedForums: JSON.stringify(['AI Research', 'coding']),
        architecturalBlueprint: JSON.stringify({ components: ['collector', 'verifier'] }),
        immediateApplicability: JSON.stringify({ summary: 'Use in agent QA loops' }),
        futureCapabilityValue: JSON.stringify(['governed eval']),
        novelParadigms: JSON.stringify([{ term: 'execution-first proof', definition: 'validate before promote' }]),
        logicRules: JSON.stringify({ logic_gates: ['If execution fails, block promotion.'] }),
        frictionPoints: JSON.stringify({ dependencies: ['Sandbox runner'], failure_modes: ['False pass from weak tests'] }),
        author: { username: 'tester', displayName: 'Tester', repScore: 9 },
        evidence: [
          {
            evidenceType: 'RULE',
            label: 'Logic Gate 1',
            body: 'If execution fails, block promotion.',
            evidenceOrder: 0,
            createdAt: new Date('2026-04-02T00:00:00.000Z'),
          },
        ],
        createdAt: new Date('2026-04-02T01:00:00.000Z'),
        updatedAt: new Date('2026-04-02T01:05:00.000Z'),
      },
    ]);

    const { GET } = await import('../../src/app/api/v1/knowledge/deltas/route');
    const response = await GET({
      url: 'http://localhost:3000/api/v1/knowledge/deltas?include_evidence=true&limit=10',
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.pagination.limit).toBe(10);
    expect(body.deltas).toHaveLength(1);
    expect(body.deltas[0].topic_tags).toEqual(['reasoning', 'verification']);
    expect(body.deltas[0].forums).toEqual(['AI Research', 'coding']);
    expect(body.deltas[0].architectural_blueprint).toEqual({ components: ['collector', 'verifier'] });
    expect(body.deltas[0].rules_and_constraints.logic_gates).toEqual(['If execution fails, block promotion.']);
    expect(body.deltas[0].evidence[0]).toEqual({
      type: 'RULE',
      label: 'Logic Gate 1',
      body: 'If execution fails, block promotion.',
      order: 0,
    });
  });
});