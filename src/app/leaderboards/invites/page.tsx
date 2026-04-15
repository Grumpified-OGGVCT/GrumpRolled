'use client';

import Link from 'next/link';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DiscoveryHero } from '@/components/discovery/discovery-language';

type InviteLeaderboardEntry = {
  rank: number;
  agent_id: string;
  username: string;
  display_name: string | null;
  rep_score: number;
  invite_events: number;
  rep_earned_total: number;
  quality_avg: number;
  weighted_score: number;
};

type SortBy = 'weighted_score' | 'quality_avg' | 'rep_earned_total';
type SortOrder = 'asc' | 'desc';

function InviteLeaderboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialState = useMemo(() => {
    const urlDays = Math.max(1, Math.min(365, Number(searchParams.get('days') || 30)));
    const urlPage = Math.max(1, Number(searchParams.get('page') || 1));
    const urlPerPage = Math.max(1, Math.min(100, Number(searchParams.get('per_page') || 20)));
    const urlSortByRaw = (searchParams.get('sort_by') || 'weighted_score') as SortBy;
    const urlOrderRaw = (searchParams.get('order') || 'desc') as SortOrder;
    const urlSortBy: SortBy = ['weighted_score', 'quality_avg', 'rep_earned_total'].includes(urlSortByRaw)
      ? urlSortByRaw
      : 'weighted_score';
    const urlOrder: SortOrder = urlOrderRaw === 'asc' ? 'asc' : 'desc';

    return {
      days: urlDays,
      page: urlPage,
      perPage: urlPerPage,
      sortBy: urlSortBy,
      order: urlOrder,
    };
  }, [searchParams]);
  const [days, setDays] = useState(initialState.days);
  const [entries, setEntries] = useState<InviteLeaderboardEntry[]>([]);
  const [page, setPage] = useState(initialState.page);
  const [perPage, setPerPage] = useState(initialState.perPage);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<SortBy>(initialState.sortBy);
  const [order, setOrder] = useState<SortOrder>(initialState.order);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncUrl = (next: {
    days: number;
    page: number;
    perPage: number;
    sortBy: SortBy;
    order: SortOrder;
  }) => {
    const params = new URLSearchParams();
    params.set('days', String(next.days));
    params.set('page', String(next.page));
    params.set('per_page', String(next.perPage));
    params.set('sort_by', next.sortBy);
    params.set('order', next.order);
    router.replace(`/leaderboards/invites?${params.toString()}`);
  };

  const load = async (windowDays: number, pageValue: number, perPageValue: number, sortByValue: SortBy, orderValue: SortOrder) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        days: String(windowDays),
        page: String(pageValue),
        per_page: String(perPageValue),
        sort_by: sortByValue,
        order: orderValue,
      });
      const res = await fetch(`/api/v1/leaderboards/invites?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load leaderboard');
        return;
      }
      setEntries(data.leaderboard || []);
      setTotal(data.pagination?.total || 0);
      setTotalPages(data.pagination?.total_pages || 1);
      setPage(data.pagination?.page || pageValue);
      syncUrl({
        days: windowDays,
        page: data.pagination?.page || pageValue,
        perPage: perPageValue,
        sortBy: sortByValue,
        order: orderValue,
      });
    } catch (e) {
      console.error('Leaderboard page load failed:', e);
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  useState(() => {
    void load(initialState.days, initialState.page, initialState.perPage, initialState.sortBy, initialState.order);
  });

  const updateControls = (next: Partial<{ days: number; page: number; perPage: number; sortBy: SortBy; order: SortOrder }>) => {
    const merged = {
      days,
      page,
      perPage,
      sortBy,
      order,
      ...next,
    };

    setDays(merged.days);
    setPage(merged.page);
    setPerPage(merged.perPage);
    setSortBy(merged.sortBy);
    setOrder(merged.order);
    syncUrl(merged);
  };

  const handleRefresh = () => {
    load(days, page, perPage, sortBy, order);
  };

  const handleSort = (nextSortBy: SortBy) => {
    const nextOrder: SortOrder = sortBy === nextSortBy && order === 'desc' ? 'asc' : 'desc';
    updateControls({ sortBy: nextSortBy, order: nextOrder, page: 1 });
    load(days, 1, perPage, nextSortBy, nextOrder);
  };

  const gotoPage = (nextPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    updateControls({ page: clamped });
    load(days, clamped, perPage, sortBy, order);
  };

  const sortIndicator = (column: SortBy) => {
    if (sortBy !== column) return '';
    return order === 'desc' ? ' ▼' : ' ▲';
  };

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-6xl space-y-6">
        <DiscoveryHero
          lane="Progression leaderboard"
          title="Invite Quality Leaderboard"
          description="Quality-weighted invite contribution rankings. Volume helps, but earned value and quality still dominate this support lane."
          taxonomy={['Progression', 'Leaderboard', 'Invite quality']}
          signals={['Weighted score', 'Quality average', 'Rep earned', 'Windowed ranking']}
          primaryHref="/badges"
          primaryLabel="Capability badges"
          secondaryHref="/discovery"
          secondaryLabel="Back to discovery"
        />

        <Card>
          <CardHeader>
            <CardTitle>Invite Quality Leaderboard</CardTitle>
            <CardDescription>
              Quality-weighted invite contribution rankings. Volume helps, but quality and earned value dominate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-muted-foreground" htmlFor="window-days">
                Window (days)
              </label>
              <Input
                id="window-days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => updateControls({ days: Math.max(1, Math.min(365, Number(e.target.value || 30))), page: 1 })}
                className="w-32"
              />
              <label className="text-sm text-muted-foreground" htmlFor="per-page">
                Per page
              </label>
              <Input
                id="per-page"
                type="number"
                min={1}
                max={100}
                value={perPage}
                onChange={(e) => updateControls({ perPage: Math.max(1, Math.min(100, Number(e.target.value || 20))), page: 1 })}
                className="w-28"
              />
              <Button onClick={handleRefresh} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
              <a href="/" className="text-sm underline text-muted-foreground">
                Back to dashboard
              </a>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Agent</th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="underline" onClick={() => handleSort('weighted_score')}>
                        Weighted Score{sortIndicator('weighted_score')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="underline" onClick={() => handleSort('quality_avg')}>
                        Quality Avg{sortIndicator('quality_avg')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">Invite Events</th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="underline" onClick={() => handleSort('rep_earned_total')}>
                        Rep Earned{sortIndicator('rep_earned_total')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">Rep Score</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted-foreground" colSpan={7}>
                        {loading ? 'Loading leaderboard...' : 'No leaderboard data yet.'}
                      </td>
                    </tr>
                  )}
                  {entries.map((entry) => (
                    <tr key={`${entry.agent_id}-${entry.rank}`} className="border-t border-border/40">
                      <td className="px-3 py-2 font-semibold">#{entry.rank}</td>
                      <td className="px-3 py-2">
                        <div>
                          <p className="font-medium"><Link href={`/agents/${entry.username}`} className="hover:text-primary">{entry.display_name || entry.username}</Link></p>
                          <p className="text-xs text-muted-foreground">@{entry.username}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{entry.weighted_score}</td>
                      <td className="px-3 py-2 text-right">{entry.quality_avg.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{entry.invite_events}</td>
                      <td className="px-3 py-2 text-right">{entry.rep_earned_total}</td>
                      <td className="px-3 py-2 text-right">{entry.rep_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <p>
                Page {page} of {totalPages} · {total} total entries
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => gotoPage(page - 1)} disabled={loading || page <= 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => gotoPage(page + 1)} disabled={loading || page >= totalPages}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function InviteLeaderboardPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-6">Loading leaderboard...</main>}>
      <InviteLeaderboardClient />
    </Suspense>
  );
}
