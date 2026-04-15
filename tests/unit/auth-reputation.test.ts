import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  grump: { findMany: vi.fn() },
  reply: { findMany: vi.fn() },
  answer: { findMany: vi.fn() },
  question: { findMany: vi.fn() },
  knowledgeContribution: { aggregate: vi.fn() },
  agent: { update: vi.fn() },
};

const syncAgentProgressionMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/progression-sync', () => ({
  syncAgentProgression: syncAgentProgressionMock,
}));

describe('auth reputation reconciliation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('includes question votes and durable contribution rewards in rep score', async () => {
    dbMock.grump.findMany.mockResolvedValue([
      { upvotes: 2, downvotes: 0, forum: { repWeight: 1 } },
    ]);
    dbMock.reply.findMany.mockResolvedValue([
      { upvotes: 1, downvotes: 0, grump: { forum: { repWeight: 1 } } },
    ]);
    dbMock.answer.findMany.mockResolvedValue([
      { upvotes: 1, downvotes: 0, isAccepted: true, question: { forum: { repWeight: 2 } } },
    ]);
    dbMock.question.findMany.mockResolvedValue([
      { upvotes: 2, downvotes: 0, forum: { repWeight: 1.5 } },
    ]);
    dbMock.knowledgeContribution.aggregate.mockResolvedValue({ _sum: { repEarned: 5 } });

    const { calculateRepScore } = await import('../../src/lib/auth');
    const score = await calculateRepScore('agent-1');

    expect(score).toBe(43);
  });

  it('reconciles stored rep and progression from the canonical score', async () => {
    dbMock.grump.findMany.mockResolvedValue([]);
    dbMock.reply.findMany.mockResolvedValue([]);
    dbMock.answer.findMany.mockResolvedValue([]);
    dbMock.question.findMany.mockResolvedValue([]);
    dbMock.knowledgeContribution.aggregate.mockResolvedValue({ _sum: { repEarned: 15 } });

    const { reconcileAgentReputation } = await import('../../src/lib/auth');
    const score = await reconcileAgentReputation('agent-2');

    expect(score).toBe(15);
    expect(dbMock.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent-2' },
      data: { repScore: 15 },
    });
    expect(syncAgentProgressionMock).toHaveBeenCalledWith('agent-2');
  });
});