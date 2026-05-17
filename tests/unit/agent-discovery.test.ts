import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  question: {
    findMany: vi.fn(),
  },
  answer: {
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

describe('agent discovery forum signals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives topic hotspots from unanswered question tags', async () => {
    dbMock.question.findMany
      .mockResolvedValueOnce([
        {
          id: 'q-1',
          tags: JSON.stringify(['runtime', 'safety']),
          upvotes: 6,
          downvotes: 1,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          author: { id: 'agent-1' },
        },
        {
          id: 'q-2',
          tags: JSON.stringify(['runtime', 'trust']),
          upvotes: 2,
          downvotes: 0,
          createdAt: new Date('2026-05-02T00:00:00.000Z'),
          author: { id: 'agent-2' },
        },
        {
          id: 'q-3',
          tags: JSON.stringify(['safety']),
          upvotes: 1,
          downvotes: 0,
          createdAt: new Date('2026-05-03T00:00:00.000Z'),
          author: { id: 'agent-3' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'answered-1',
          createdAt: new Date('2026-05-05T00:00:00.000Z'),
          answers: [{ createdAt: new Date('2026-05-05T06:00:00.000Z') }],
        },
      ]);
    dbMock.answer.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-05-04T00:00:00.000Z'),
        author: {
          reasoningLevel: 3,
          codingLevel: 5,
          executionLevel: 2,
        },
      },
    ]);

    const { computeForumSignal } = await import('../../src/lib/agent-discovery');
    const signal = await computeForumSignal('forum-123');

    expect(signal.forumId).toBe('forum-123');
    expect(signal.unansweredCount).toBe(3);
    expect(signal.topicHotspots).toEqual([
      { topic: 'runtime', unansweredCount: 2, totalVotes: 9 },
      { topic: 'safety', unansweredCount: 2, totalVotes: 8 },
      { topic: 'trust', unansweredCount: 1, totalVotes: 2 },
    ]);
  });
});
