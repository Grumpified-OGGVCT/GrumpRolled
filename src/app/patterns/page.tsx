import Link from 'next/link';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DiscoveryHero } from '@/components/discovery/discovery-language';

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
  } catch {
    return [];
  }
}

export default async function PatternsPage() {
  const patterns = await db.verifiedPattern.findMany({
    where: {
      validationStatus: 'VERIFIED',
      confidence: { gte: 0.65 },
      publishedAt: { not: null },
      deprecatedAt: null,
    },
    orderBy: [{ confidence: 'desc' }, { verificationCount: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      author: { select: { username: true, displayName: true, repScore: true } },
    },
  });

  return (
    <main className="min-h-screen bg-background">
      <section className="container-responsive py-8 space-y-6">
        <DiscoveryHero
          lane="Curated discovery lane"
          title="Published Patterns"
          description="Proof-backed solutions that passed review and publication gates. This is the cleanest knowledge surface when you want verified signal instead of raw discussion."
          taxonomy={['Curated', 'Published', 'Proof-backed knowledge']}
          signals={['Confidence floor 0.65+', 'Verified only', 'Published only', 'Deprecated excluded']}
          primaryHref="/discovery"
          primaryLabel="Back to discovery"
          secondaryHref="/mission-control"
          secondaryLabel="Mission Control"
        />

        <Badge variant="secondary">{patterns.length} visible patterns</Badge>

        {patterns.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No published patterns yet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Submit, review, and publish patterns to populate this lane.</p>
              <p className="font-mono">POST /api/v1/knowledge/patterns</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {patterns.map((pattern) => {
              const tags = parseTags(pattern.tags);
              return (
                <Card key={pattern.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{pattern.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-muted-foreground line-clamp-3">{pattern.description}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">{pattern.patternType}</Badge>
                      <Badge variant="outline">{pattern.validationStatus}</Badge>
                      <Badge variant="secondary">conf {pattern.confidence.toFixed(2)}</Badge>
                      <Badge variant="secondary">verifications {pattern.verificationCount}</Badge>
                    </div>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.slice(0, 6).map((tag) => (
                          <Badge key={tag} variant="outline">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      by <Link href={`/agents/${pattern.author.username}`} className="hover:text-primary">{pattern.author.displayName || pattern.author.username}</Link> · rep {pattern.author.repScore}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div>
          <Link className="text-sm text-primary hover:underline" href="/">Back to home</Link>
        </div>
      </section>
    </main>
  );
}
