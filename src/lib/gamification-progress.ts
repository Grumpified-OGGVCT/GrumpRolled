import { db } from '@/lib/db';

export type AgentTrackProgress = {
  track_type: string;
  level: number;
  total_levels: number;
  current: {
    slug: string;
    name: string;
    required_rep: number;
  } | null;
  next: {
    slug: string;
    name: string;
    need_rep: number;
    need_patterns: number;
    need_validations: number;
  } | null;
};

export type AgentGamificationProgress = {
  agent_id: string;
  stats: {
    rep_score: number;
    authored_patterns: number;
    validations: number;
  };
  tracks: {
    unlocked_count: number;
    total_count: number;
    by_type: AgentTrackProgress[];
  };
  badges: {
    unlocked_count: number;
    total_count: number;
    unlocked: Array<{
      slug: string;
      name: string;
      tier: string;
      required_score: number;
      track_slug: string | null;
    }>;
  };
};

export async function getAgentGamificationProgress(agentId: string): Promise<AgentGamificationProgress | null> {
  const [fullAgent, authoredPatterns, validations, tracks, badges] = await Promise.all([
    db.agent.findUnique({ where: { id: agentId }, select: { id: true, repScore: true } }),
    db.verifiedPattern.count({ where: { authorId: agentId } }),
    db.patternValidation.count({ where: { validatorId: agentId } }),
    db.upgradeTrack.findMany({ orderBy: [{ trackType: 'asc' }, { requiredRep: 'asc' }] }),
    db.capabilityBadge.findMany({ orderBy: [{ requiredScore: 'asc' }] }),
  ]);

  if (!fullAgent) {
    return null;
  }

  const eligibleTracks = tracks.filter(
    (track) =>
      fullAgent.repScore >= track.requiredRep &&
      authoredPatterns >= track.requiredPatterns &&
      validations >= track.requiredValidations
  );

  const byType = new Map<string, typeof tracks>();
  for (const track of tracks) {
    const list = byType.get(track.trackType) || [];
    list.push(track);
    byType.set(track.trackType, list);
  }

  const trackProgress: AgentTrackProgress[] = [...byType.entries()].map(([trackType, list]) => {
    const sorted = [...list].sort((left, right) => left.requiredRep - right.requiredRep);
    const unlocked = sorted.filter(
      (track) =>
        fullAgent.repScore >= track.requiredRep &&
        authoredPatterns >= track.requiredPatterns &&
        validations >= track.requiredValidations
    );
    const current = unlocked.length > 0 ? unlocked[unlocked.length - 1] : null;
    const next =
      sorted.find(
        (track) =>
          fullAgent.repScore < track.requiredRep ||
          authoredPatterns < track.requiredPatterns ||
          validations < track.requiredValidations
      ) || null;

    return {
      track_type: trackType,
      level: unlocked.length,
      total_levels: sorted.length,
      current: current
        ? {
            slug: current.slug,
            name: current.name,
            required_rep: current.requiredRep,
          }
        : null,
      next: next
        ? {
            slug: next.slug,
            name: next.name,
            need_rep: Math.max(0, next.requiredRep - fullAgent.repScore),
            need_patterns: Math.max(0, next.requiredPatterns - authoredPatterns),
            need_validations: Math.max(0, next.requiredValidations - validations),
          }
        : null,
    };
  });

  const unlockedBadges = badges
    .filter((badge) => fullAgent.repScore >= badge.requiredScore)
    .map((badge) => ({
      slug: badge.slug,
      name: badge.name,
      tier: badge.tier,
      required_score: badge.requiredScore,
      track_slug: badge.trackSlug,
    }));

  return {
    agent_id: fullAgent.id,
    stats: {
      rep_score: fullAgent.repScore,
      authored_patterns: authoredPatterns,
      validations,
    },
    tracks: {
      unlocked_count: eligibleTracks.length,
      total_count: tracks.length,
      by_type: trackProgress,
    },
    badges: {
      unlocked_count: unlockedBadges.length,
      total_count: badges.length,
      unlocked: unlockedBadges,
    },
  };
}