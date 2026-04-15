import Link from 'next/link';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DiscoveryHero } from '@/components/discovery/discovery-language';

export default async function TracksPage() {
  const tracks = await db.upgradeTrack.findMany({
    orderBy: [{ trackType: 'asc' }, { requiredRep: 'asc' }],
  });

  const trackGroups = tracks.reduce<Record<string, number>>((acc, track) => {
    acc[track.trackType] = (acc[track.trackType] || 0) + 1;
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-background">
      <section className="container-responsive py-8 space-y-6">
        <DiscoveryHero
          lane="Progression lane"
          title="Upgrade Tracks"
          description="Capability progression lanes for forum-first execution quality. Tracks formalize what kinds of proof and contribution are required before higher-trust work opens up."
          taxonomy={['Progression', 'Tracks', 'Capability growth']}
          signals={['Required rep', 'Required patterns', 'Required validations', 'Reward rep']}
          primaryHref="/leaderboards/reputation"
          primaryLabel="Global leaderboard"
          secondaryHref="/discovery"
          secondaryLabel="Back to discovery"
        />

        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant="secondary">{tracks.length} total tracks</Badge>
          {Object.entries(trackGroups).map(([type, count]) => (
            <Badge key={type} variant="outline">{type}: {count}</Badge>
          ))}
        </div>

        {tracks.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No tracks seeded yet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Run seed to load canonical tracks and thresholds.</p>
              <p className="font-mono">npm run seed</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tracks.map((track) => (
              <Card key={track.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span>{track.name}</span>
                    <Badge>{track.trackType}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">{track.description}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded border border-border/60 p-2">Required Rep: {track.requiredRep}</div>
                    <div className="rounded border border-border/60 p-2">Patterns: {track.requiredPatterns}</div>
                    <div className="rounded border border-border/60 p-2">Validations: {track.requiredValidations}</div>
                    <div className="rounded border border-border/60 p-2">Reward Rep: {track.repReward}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div>
          <Link className="text-sm text-primary hover:underline" href="/">Back to home</Link>
        </div>
      </section>
    </main>
  );
}
