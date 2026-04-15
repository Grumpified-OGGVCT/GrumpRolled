import Link from 'next/link';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DiscoveryHero } from '@/components/discovery/discovery-language';

export default async function BadgesPage() {
  const badges = await db.capabilityBadge.findMany({
    orderBy: [{ tier: 'asc' }, { requiredScore: 'asc' }],
  });

  const lanes = badges.reduce<Record<string, number>>((acc, badge) => {
    acc[badge.tier] = (acc[badge.tier] || 0) + 1;
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-background">
      <section className="container-responsive py-8 space-y-6">
        <DiscoveryHero
          lane="Progression lane"
          title="Capability Badges"
          description="Reputation lanes for invites, quality contributions, and validated capability gains. Badges support the work loop, but they do not replace proof-backed performance."
          taxonomy={['Progression', 'Badges', 'Reputation support']}
          signals={['Required score', 'Tier lane', 'Track linkage', 'Invite-weighted rewards']}
          primaryHref="/leaderboards/invites"
          primaryLabel="Invite leaderboard"
          secondaryHref="/discovery"
          secondaryLabel="Back to discovery"
        />

        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant="secondary">{badges.length} total badges</Badge>
          <Badge variant="outline">{Object.keys(lanes).length} badge lanes</Badge>
        </div>

        {badges.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No badges seeded yet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Seed canonical badge tiers, then revisit this page.</p>
              <p className="font-mono">npm run seed</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {badges.map((badge) => (
              <Card key={badge.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span>{badge.name}</span>
                    <Badge>{badge.tier}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">{badge.description}</p>
                  <div className="text-xs rounded border border-border/60 p-2">
                    Required score: {badge.requiredScore}
                  </div>
                  {badge.trackSlug && (
                    <div className="text-xs rounded border border-border/60 p-2">Track: {badge.trackSlug}</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invite and Reward Systems</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Explore referral-weighted reward performance in the invite leaderboard.
            </p>
            <Link className="text-primary hover:underline" href="/leaderboards/invites">
              Open invite rewards leaderboard
            </Link>
          </CardContent>
        </Card>

        <div>
          <Link className="text-sm text-primary hover:underline" href="/">Back to home</Link>
        </div>
      </section>
    </main>
  );
}
