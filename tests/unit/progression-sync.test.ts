import { beforeEach, describe, expect, it, vi } from 'vitest';

const txMock = {
  agentBadge: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  agentUpgrade: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
};

const dbMock = {
  capabilityBadge: { findMany: vi.fn() },
  upgradeTrack: { findMany: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
};

const getAgentGamificationProgressMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/gamification-progress', () => ({
  getAgentGamificationProgress: getAgentGamificationProgressMock,
}));

describe('progression sync', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dbMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));
  });

  it('returns null when the agent progression cannot be computed', async () => {
    getAgentGamificationProgressMock.mockResolvedValue(null);

    const { syncAgentProgression } = await import('../../src/lib/progression-sync');
    const result = await syncAgentProgression('agent-1');

    expect(result).toBeNull();
    expect(dbMock.capabilityBadge.findMany).not.toHaveBeenCalled();
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it('projects computed badges and current tracks into persisted award tables', async () => {
    getAgentGamificationProgressMock.mockResolvedValue({
      agent_id: 'agent-1',
      stats: {
        rep_score: 120,
        authored_patterns: 3,
        validations: 1,
      },
      tracks: {
        unlocked_count: 1,
        total_count: 2,
        by_type: [
          {
            track_type: 'CODING',
            level: 1,
            total_levels: 2,
            current: {
              slug: 'coding-apprentice',
              name: 'Coding Apprentice',
              required_rep: 50,
            },
            next: {
              slug: 'coding-journeyman',
              name: 'Coding Journeyman',
              need_rep: 80,
              need_patterns: 2,
              need_validations: 1,
            },
          },
        ],
      },
      badges: {
        unlocked_count: 1,
        total_count: 2,
        unlocked: [
          {
            slug: 'first-pattern',
            name: 'First Pattern',
            tier: 'BRONZE',
            required_score: 10,
            track_slug: 'CODING',
          },
        ],
      },
    });
    dbMock.capabilityBadge.findMany.mockResolvedValue([
      { id: 'badge-1', slug: 'first-pattern' },
    ]);
    dbMock.upgradeTrack.findMany.mockResolvedValue([
      { id: 'track-1', slug: 'coding-apprentice' },
    ]);

    const { syncAgentProgression } = await import('../../src/lib/progression-sync');
    const result = await syncAgentProgression('agent-1');

    expect(result?.badges.unlocked_count).toBe(1);
    expect(dbMock.capabilityBadge.findMany).toHaveBeenCalledWith({
      where: {
        slug: {
          in: ['first-pattern'],
        },
      },
      select: { id: true, slug: true },
    });
    expect(txMock.agentBadge.deleteMany).toHaveBeenCalledWith({
      where: {
        agentId: 'agent-1',
        badgeId: {
          notIn: ['badge-1'],
        },
      },
    });
    expect(txMock.agentBadge.createMany).toHaveBeenCalledWith({
      data: [
        {
          agentId: 'agent-1',
          badgeId: 'badge-1',
        },
      ],
      skipDuplicates: true,
    });
    expect(txMock.agentUpgrade.deleteMany).toHaveBeenCalledWith({ where: { agentId: 'agent-1' } });
    expect(txMock.agentUpgrade.createMany).toHaveBeenCalledTimes(1);
    expect(txMock.agentUpgrade.createMany.mock.calls[0]?.[0]?.data).toHaveLength(1);
    expect(txMock.agentUpgrade.createMany.mock.calls[0]?.[0]?.data[0]).toMatchObject({
      agentId: 'agent-1',
      trackId: 'track-1',
      trackSlug: 'coding-apprentice',
      completedPatterns: 3,
      completedValidations: 1,
      totalRepEarned: 120,
      status: 'COMPLETED',
      completedAt: null,
    });
  });
});