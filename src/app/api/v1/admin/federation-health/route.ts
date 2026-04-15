import { NextRequest, NextResponse } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { db } from '@/lib/db';

type FederationActivityBridge = {
  externalActivity: {
    findMany: (args?: unknown) => Promise<Array<{
      platform: string;
      agentId: string;
      fetchedAt: Date;
    }>>;
  };
};

const STALE_SYNC_MS = 24 * 60 * 60 * 1000;
const OLD_PENDING_MS = 24 * 60 * 60 * 1000;

// GET /api/v1/admin/federation-health
export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbWithExternalActivity = db as typeof db & FederationActivityBridge;
    const now = Date.now();

    const [links, activities, recentActions] = await Promise.all([
      db.federatedLink.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          agent: {
            select: {
              username: true,
              displayName: true,
            },
          },
        },
      }),
      dbWithExternalActivity.externalActivity.findMany({
        orderBy: { fetchedAt: 'desc' },
      }),
      db.adminActionLog.findMany({
        where: {
          action: {
            in: ['FEDERATION_LINK_CREATE', 'FEDERATION_LINK_RESET', 'FEDERATION_LINK_VERIFY'],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const latestActivityByLink = new Map<string, Date>();
    for (const activity of activities) {
      const key = `${activity.agentId}:${activity.platform}`;
      if (!latestActivityByLink.has(key)) {
        latestActivityByLink.set(key, activity.fetchedAt);
      }
    }

    const platformSummaryMap = new Map<string, {
      platform: string;
      total_links: number;
      verified_links: number;
      pending_links: number;
      stale_links: number;
      never_synced_links: number;
      last_sync_at: string | null;
    }>();

    const linksWithHealth = links.map((link) => {
      const activityKey = `${link.agentId}:${link.platform}`;
      const latestSync = latestActivityByLink.get(activityKey) || null;
      const isVerified = link.verificationStatus === 'VERIFIED';
      const isPending = link.verificationStatus === 'PENDING';
      const isNeverSynced = isVerified && !latestSync;
      const isStale = isVerified && !!latestSync && now - latestSync.getTime() > STALE_SYNC_MS;
      const isOldPending = isPending && now - link.createdAt.getTime() > OLD_PENDING_MS;

      const existing = platformSummaryMap.get(link.platform) || {
        platform: link.platform,
        total_links: 0,
        verified_links: 0,
        pending_links: 0,
        stale_links: 0,
        never_synced_links: 0,
        last_sync_at: null,
      };

      existing.total_links += 1;
      if (isVerified) existing.verified_links += 1;
      if (isPending) existing.pending_links += 1;
      if (isStale) existing.stale_links += 1;
      if (isNeverSynced) existing.never_synced_links += 1;
      if (latestSync && (!existing.last_sync_at || new Date(existing.last_sync_at).getTime() < latestSync.getTime())) {
        existing.last_sync_at = latestSync.toISOString();
      }
      platformSummaryMap.set(link.platform, existing);

      return {
        id: link.id,
        platform: link.platform,
        external_username: link.externalUsername,
        verification_status: link.verificationStatus,
        verified_at: link.verifiedAt?.toISOString() || null,
        created_at: link.createdAt.toISOString(),
        agent: {
          username: link.agent.username,
          display_name: link.agent.displayName,
        },
        last_sync_at: latestSync?.toISOString() || null,
        health_state: isNeverSynced ? 'NEVER_SYNCED' : isStale ? 'STALE' : isOldPending ? 'PENDING_TOO_LONG' : 'HEALTHY',
      };
    });

    const summary = {
      total_links: links.length,
      verified_links: links.filter((link) => link.verificationStatus === 'VERIFIED').length,
      pending_links: links.filter((link) => link.verificationStatus === 'PENDING').length,
      stale_links: linksWithHealth.filter((link) => link.health_state === 'STALE').length,
      never_synced_links: linksWithHealth.filter((link) => link.health_state === 'NEVER_SYNCED').length,
    };

    const recent_events = recentActions.map((action) => {
      let metadata: Record<string, unknown> | null = null;
      try {
        metadata = action.metadata ? (JSON.parse(action.metadata) as Record<string, unknown>) : null;
      } catch {
        metadata = null;
      }

      return {
        action: action.action,
        target_id: action.targetId,
        platform: typeof metadata?.platform === 'string' ? metadata.platform : null,
        external_username: typeof metadata?.external_username === 'string' ? metadata.external_username : null,
        actor_label: typeof metadata?.actor_label === 'string' ? metadata.actor_label : null,
        at: action.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      scope: 'admin-federation-health',
      summary,
      platform_summary: Array.from(platformSummaryMap.values()).sort((left, right) => left.platform.localeCompare(right.platform)),
      recent_events,
      links: linksWithHealth.slice(0, 50),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin federation health error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}