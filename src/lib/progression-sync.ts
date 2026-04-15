import { db } from '@/lib/db';
import { recomputeAgentCapabilityEconomy } from '@/lib/capability-economy';
import { getAgentGamificationProgress } from '@/lib/gamification-progress';

type DbClient = typeof db;

export async function syncAgentProgression(agentId: string, client: DbClient = db) {
  const progression = await getAgentGamificationProgress(agentId);

  if (!progression) {
    return null;
  }

  const [badgeRecords, trackRecords] = await Promise.all([
    client.capabilityBadge.findMany({
      where: {
        slug: {
          in: progression.badges.unlocked.map((badge) => badge.slug),
        },
      },
      select: { id: true, slug: true },
    }),
    client.upgradeTrack.findMany({
      where: {
        slug: {
          in: progression.tracks.by_type
            .map((track) => track.current?.slug)
            .filter((slug): slug is string => Boolean(slug)),
        },
      },
      select: { id: true, slug: true },
    }),
  ]);

  const unlockedBadgeIds = new Set(badgeRecords.map((badge) => badge.id));
  const unlockedTrackBySlug = new Map(trackRecords.map((track) => [track.slug, track.id]));

  await client.$transaction(async (tx) => {
    await tx.agentBadge.deleteMany({
      where: {
        agentId,
        ...(unlockedBadgeIds.size > 0
          ? {
              badgeId: {
                notIn: [...unlockedBadgeIds],
              },
            }
          : {}),
      },
    });

    if (badgeRecords.length > 0) {
      await tx.agentBadge.createMany({
        data: badgeRecords.map((badge) => ({
          agentId,
          badgeId: badge.id,
        })),
        skipDuplicates: true,
      });
    }

    await tx.agentUpgrade.deleteMany({ where: { agentId } });

    const currentTracks = progression.tracks.by_type.filter((track) => track.current);
    if (currentTracks.length > 0) {
      await tx.agentUpgrade.createMany({
        data: currentTracks.map((track) => ({
          agentId,
          trackId: unlockedTrackBySlug.get(track.current!.slug) ?? null,
          trackSlug: track.current!.slug,
          completedPatterns: progression.stats.authored_patterns,
          completedValidations: progression.stats.validations,
          totalRepEarned: progression.stats.rep_score,
          status: track.next ? 'COMPLETED' : 'MASTERED',
          completedAt: track.next ? null : new Date(),
        })),
      });
    }
  });

  await recomputeAgentCapabilityEconomy(agentId);

  return progression;
}

export async function getCanonicalAgentProgression(agentId: string) {
  const progression = await getAgentGamificationProgress(agentId);

  if (!progression) {
    return null;
  }

  await syncAgentProgression(agentId);
  return progression;
}