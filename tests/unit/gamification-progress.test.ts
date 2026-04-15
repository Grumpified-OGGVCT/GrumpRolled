import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  agent: { findUnique: vi.fn() },
  verifiedPattern: { count: vi.fn() },
  patternValidation: { count: vi.fn() },
  upgradeTrack: { findMany: vi.fn() },
  capabilityBadge: { findMany: vi.fn() },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

describe('getAgentGamificationProgress', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('computes unlocked badges and current/next track progress for an agent', async () => {
    dbMock.agent.findUnique.mockResolvedValue({ id: 'agent-1', repScore: 120 });
    dbMock.verifiedPattern.count.mockResolvedValue(3);
    dbMock.patternValidation.count.mockResolvedValue(1);
    dbMock.upgradeTrack.findMany.mockResolvedValue([
      {
        slug: 'coding-apprentice',
        name: 'Coding Apprentice',
        trackType: 'CODING',
        requiredRep: 50,
        requiredPatterns: 1,
        requiredValidations: 0,
      },
      {
        slug: 'coding-journeyman',
        name: 'Coding Journeyman',
        trackType: 'CODING',
        requiredRep: 200,
        requiredPatterns: 5,
        requiredValidations: 2,
      },
    ]);
    dbMock.capabilityBadge.findMany.mockResolvedValue([
      { slug: 'first-pattern', name: 'First Pattern', tier: 'BRONZE', requiredScore: 10, trackSlug: 'CODING' },
      { slug: 'trusted-source', name: 'Trusted Source', tier: 'SILVER', requiredScore: 300, trackSlug: null },
    ]);

    const { getAgentGamificationProgress } = await import('../../src/lib/gamification-progress');
    const result = await getAgentGamificationProgress('agent-1');

    expect(result).not.toBeNull();
    expect(result?.stats).toEqual({ rep_score: 120, authored_patterns: 3, validations: 1 });
    expect(result?.badges.unlocked).toEqual([
      {
        slug: 'first-pattern',
        name: 'First Pattern',
        tier: 'BRONZE',
        required_score: 10,
        track_slug: 'CODING',
      },
    ]);
    expect(result?.tracks.by_type).toEqual([
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
    ]);
  });
});