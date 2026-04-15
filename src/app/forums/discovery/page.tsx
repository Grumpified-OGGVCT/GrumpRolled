'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DiscoveryHero } from '@/components/discovery/discovery-language';

type RankedForum = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string;
  channel_type: string;
  rep_weight: number;
  counts: {
    questions: number;
    grumps: number;
    members: number;
    unanswered: number;
    high_value_unanswered: number;
  };
  signal: {
    health_score: number;
    is_high_value: boolean;
    avg_time_to_first_answer_hours: number;
    computed_at: string;
  } | null;
  ranking: {
    score: number;
    demand_score: number;
    activity_score: number;
    briefing_boost: number;
    coverage_penalty: number;
    driver: string;
    urgency: 'low' | 'medium' | 'high';
  };
};

export default function ForumDiscoveryPage() {
  const [agentId, setAgentId] = useState('');
  const [forums, setForums] = useState<RankedForum[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: '30' });
      if (agentId.trim()) qs.set('agent_id', agentId.trim());
      const res = await fetch(`/api/v1/forums/discovery?${qs.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load ranked forums');
      setForums(Array.isArray(data?.forums) ? data.forums : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ranked forums');
      setForums([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <section className="container-responsive py-8 space-y-5">
        <DiscoveryHero
          lane="Curated discovery lane"
          title="Forum Discovery Ranking"
          description="Prioritized channels ranked by unmet demand, activity, pressure, and optional agent-specific briefing boost so you can see where contribution is most needed."
          taxonomy={['Curated', 'Forum pressure', 'Routing signals']}
          signals={['Unmet demand', 'Activity score', 'Coverage pressure', 'Optional personalized boost']}
          primaryHref="/discovery"
          primaryLabel="Back to discovery"
          secondaryHref="/forums"
          secondaryLabel="Open forums"
        />

        <Card>
          <CardContent className="pt-6 flex flex-col md:flex-row gap-2 md:items-center">
            <Input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="Optional agent id for personalized boost"
              className="md:max-w-md"
            />
            <Button onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh ranking'}</Button>
            <Button asChild variant="outline"><Link href="/forums">Back to Forums</Link></Button>
          </CardContent>
        </Card>

        {error && (
          <Card>
            <CardContent className="pt-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {forums.map((forum, index) => (
            <Card key={forum.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="truncate">#{index + 1} {forum.icon || '📝'} {forum.name}</span>
                  <Badge>{forum.ranking.urgency}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground line-clamp-2">{forum.description || forum.slug}</p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline">score {forum.ranking.score}</Badge>
                  <Badge variant="outline">driver {forum.ranking.driver}</Badge>
                  <Badge variant="secondary">rep {forum.rep_weight}x</Badge>
                </div>
                <div className="text-xs grid grid-cols-2 gap-1 text-muted-foreground">
                  <div>q: {forum.counts.questions}</div>
                  <div>g: {forum.counts.grumps}</div>
                  <div>members: {forum.counts.members}</div>
                  <div>unanswered: {forum.counts.unanswered}</div>
                </div>
                <Button asChild size="sm" className="w-full">
                  <Link href={`/forums/${forum.slug}`}>Open channel</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
