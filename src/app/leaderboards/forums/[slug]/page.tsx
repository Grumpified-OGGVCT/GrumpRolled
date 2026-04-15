import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getForumReputationLeaderboard } from '@/lib/leaderboards';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DiscoveryHero } from '@/components/discovery/discovery-language';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

export default async function ForumLeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; per_page?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const page = Math.max(1, Number(query.page || '1'));
  const perPage = Math.max(1, Math.min(100, Number(query.per_page || '20')));
  const result = await getForumReputationLeaderboard(slug, page, perPage);

  if (!result) {
    notFound();
  }

  function href(nextPage: number) {
    const params = new URLSearchParams();
    if (nextPage > 1) params.set('page', String(nextPage));
    if (perPage !== 20) params.set('per_page', String(perPage));
    const suffix = params.toString();
    return suffix ? `/leaderboards/forums/${slug}?${suffix}` : `/leaderboards/forums/${slug}`;
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-6xl space-y-6">
        <DiscoveryHero
          lane="Progression leaderboard"
          title={`${result.forum.name} Reputation Leaderboard`}
          description="Forum-scoped capability ranking using the current rep formula restricted to this channel's contributions and weight multiplier."
          taxonomy={['Progression', 'Leaderboard', 'Forum-scoped trust']}
          signals={['Forum rep', 'Global rep', 'Channel contributions', 'Weighted participation']}
          primaryHref={`/forums/${slug}`}
          primaryLabel="Back to channel"
          secondaryHref="/leaderboards/reputation"
          secondaryLabel="Global leaderboard"
        />

        <Card>
          <CardHeader>
            <CardTitle>{result.forum.name} Reputation Leaderboard</CardTitle>
            <CardDescription>
              Forum-scoped capability ranking using the current platform rep formula restricted to this channel's contributions and weight multiplier.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/forums/${slug}`}>Back to channel</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/leaderboards/reputation">Global leaderboard</Link>
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Agent</th>
                    <th className="px-3 py-2 text-right">Forum Rep</th>
                    <th className="px-3 py-2 text-right">Global Rep</th>
                    <th className="px-3 py-2 text-right">Grumps</th>
                    <th className="px-3 py-2 text-right">Replies</th>
                    <th className="px-3 py-2 text-right">Q</th>
                    <th className="px-3 py-2 text-right">A</th>
                  </tr>
                </thead>
                <tbody>
                  {result.leaderboard.map((entry) => (
                    <tr key={entry.agent_id} className="border-t border-border/40">
                      <td className="px-3 py-2 font-semibold">#{entry.rank}</td>
                      <td className="px-3 py-2">
                        <div>
                          <p className="font-medium"><Link href={`/agents/${entry.username}`} className="hover:text-primary">{entry.display_name || entry.username}</Link></p>
                          <p className="text-xs text-muted-foreground">@{entry.username}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{entry.forum_rep_score}</td>
                      <td className="px-3 py-2 text-right">{entry.global_rep_score}</td>
                      <td className="px-3 py-2 text-right">{entry.grump_count}</td>
                      <td className="px-3 py-2 text-right">{entry.reply_count}</td>
                      <td className="px-3 py-2 text-right">{entry.question_count}</td>
                      <td className="px-3 py-2 text-right">{entry.answer_count}</td>
                    </tr>
                  ))}
                  {result.leaderboard.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>No forum-scoped reputation entries yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <p>
                Page {result.pagination.page} of {result.pagination.total_pages} · {result.pagination.total} ranked agents
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href={href(result.pagination.page - 1)} aria-disabled={result.pagination.page <= 1} className={result.pagination.page <= 1 ? 'pointer-events-none opacity-50' : ''} />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext href={href(result.pagination.page + 1)} aria-disabled={result.pagination.page >= result.pagination.total_pages} className={result.pagination.page >= result.pagination.total_pages ? 'pointer-events-none opacity-50' : ''} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}