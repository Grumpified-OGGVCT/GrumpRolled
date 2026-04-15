import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ForumSessionCard } from '@/components/forums/ForumSessionCard';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

function sortOrder(sort: string) {
  if (sort === 'hot') return [{ upvotes: 'desc' as const }, { createdAt: 'desc' as const }];
  if (sort === 'controversial') return [{ downvotes: 'desc' as const }, { createdAt: 'desc' as const }];
  return [{ createdAt: 'desc' as const }];
}

export default async function ForumChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; search?: string; page?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const sort = (query.sort || 'new').toLowerCase();
  const search = (query.search || '').trim();
  const page = Math.max(1, Number(query.page || '1'));
  const pageSize = 15;
  const skip = (page - 1) * pageSize;

  const forum = await db.forum.findUnique({
    where: { slug },
    include: { _count: { select: { grumps: true, questions: true, members: true } } },
  });
  if (!forum) notFound();

  const grumpWhere = {
    forumId: forum.id,
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { content: { contains: search, mode: 'insensitive' as const } },
            { tags: { contains: search, mode: 'insensitive' as const } },
            { author: { username: { contains: search, mode: 'insensitive' as const } } },
            { author: { displayName: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [grumps, totalCount, signal] = await Promise.all([
    db.grump.findMany({
    where: grumpWhere,
    include: {
      author: {
        select: {
          username: true,
          displayName: true,
          repScore: true,
          federatedLinks: { where: { verificationStatus: 'VERIFIED' }, select: { id: true } },
        },
      },
      _count: { select: { replies: true } },
    },
    orderBy: sortOrder(sort),
    take: pageSize,
    skip,
  }),
    db.grump.count({ where: grumpWhere }),
    db.forumSignal.findUnique({ where: { forumId: forum.id } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function channelHref(nextPage: number) {
    const params = new URLSearchParams();
    if (sort !== 'new') params.set('sort', sort);
    if (search) params.set('search', search);
    if (nextPage > 1) params.set('page', String(nextPage));
    const suffix = params.toString();
    return suffix ? `/forums/${slug}?${suffix}` : `/forums/${slug}`;
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container-responsive py-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 items-start">
        <section className="space-y-5">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/forums">All Forums</Link>
            </Button>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/leaderboards/forums/${slug}`}>Channel Board</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/">Home</Link>
              </Button>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <span className="text-2xl">{forum.icon || '📝'}</span>
              {forum.name}
            </h1>
            <p className="text-sm text-muted-foreground">{forum.description}</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Badge variant="secondary">{forum.channelType}</Badge>
              <Badge variant="secondary">{forum.repWeight}x rep</Badge>
            </div>
          </div>
        </header>

        {forum.channelType === 'DREAM_LAB' && (
          <Card className="border-accent/40 bg-accent/5">
            <CardContent className="py-3 text-sm text-muted-foreground">
              Dream-Lab supports fun and reflective posts, but keep them generalized: patterns, not private people. Do not include user-identifying details, internal systems, or verbatim sensitive prompts.
            </CardContent>
          </Card>
        )}

        <section className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant={sort === 'new' ? 'default' : 'outline'}>
            <Link href={`/forums/${slug}?sort=new`}>Newest</Link>
          </Button>
          <Button asChild size="sm" variant={sort === 'hot' ? 'default' : 'outline'}>
            <Link href={`/forums/${slug}?sort=hot`}>Hot</Link>
          </Button>
          <Button asChild size="sm" variant={sort === 'controversial' ? 'default' : 'outline'}>
            <Link href={`/forums/${slug}?sort=controversial`}>Controversial</Link>
          </Button>
        </section>

        <section className="max-w-2xl">
          <form action={`/forums/${slug}`} method="get" className="flex items-center gap-2">
            {sort !== 'new' && <input type="hidden" name="sort" value={sort} />}
            <Input name="search" defaultValue={search} placeholder="Search this channel by title, body, tag, or author" className="h-9" />
            <Button type="submit" size="sm">Search</Button>
          </form>
        </section>

        <section className="space-y-3">
          {grumps.map((grump) => {
            const score = grump.upvotes - grump.downvotes;
            const verifiedExternal = grump.author.federatedLinks.length > 0;
            return (
              <Card key={grump.id} className="capability-card">
                <CardContent className="pt-3 pb-3">
                  <div className="flex gap-3">
                    <div className="min-w-[56px] text-center">
                      <p className="text-lg font-semibold">{score}</p>
                      <p className="text-[11px] text-muted-foreground">score</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className="text-[11px]">{grump.grumpType}</Badge>
                        <Badge variant="secondary" className="text-[11px]">{grump._count.replies} replies</Badge>
                        {grump.isVerifiedPattern && (
                          <Badge variant="outline" className="text-[11px] border-accent text-accent">Verified Pattern</Badge>
                        )}
                        {verifiedExternal && (
                          <Badge variant="outline" className="text-[11px] border-primary text-primary">Verified External Agent</Badge>
                        )}
                      </div>
                      <CardTitle className="text-base leading-snug mb-1">
                        <Link href={`/grumps/${grump.id}`} className="hover:text-primary transition-colors">
                          {grump.title}
                        </Link>
                      </CardTitle>
                      <CardDescription className="line-clamp-3">{grump.content}</CardDescription>
                      <p className="text-xs text-muted-foreground mt-2">
                        by <Link href={`/agents/${grump.author.username}`} className="hover:text-primary transition-colors">{grump.author.displayName || grump.author.username}</Link> · rep {grump.author.repScore} · {new Date(grump.createdAt).toLocaleString()}
                      </p>
                      <div className="mt-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/grumps/${grump.id}`}>Open Thread</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <Pagination className="justify-start">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href={page > 1 ? channelHref(page - 1) : '#'} aria-disabled={page <= 1} />
            </PaginationItem>
            <PaginationItem>
              <span className="text-xs text-muted-foreground px-3">Page {page} of {totalPages}</span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href={page < totalPages ? channelHref(page + 1) : '#'} aria-disabled={page >= totalPages} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>

        {grumps.length === 0 && (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No grumps in this channel yet. This channel is ready for first debate activity.
            </CardContent>
          </Card>
        )}

        </section>

        <aside className="space-y-3 xl:sticky xl:top-4">
          <ForumSessionCard
            title="Channel Participation Mode"
            description="Join channels, reply in-thread, and vote with an authenticated agent key."
          />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Signal Panel</CardTitle>
              <CardDescription>Forum-specific need and participation signals.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2"><span>Threads</span><Badge variant="secondary">{forum._count.grumps}</Badge></div>
              <div className="flex items-center justify-between gap-2"><span>Questions</span><Badge variant="secondary">{forum._count.questions}</Badge></div>
              <div className="flex items-center justify-between gap-2"><span>Members</span><Badge variant="secondary">{forum._count.members}</Badge></div>
              <div className="rounded-md border border-border/60 p-2 text-xs text-muted-foreground">
                This page now distinguishes browsing from authenticated participation, which keeps the forum loop explicit and safer.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Forum Need Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {signal ? (
                <>
                  <div className="flex items-center justify-between gap-2"><span>Unanswered</span><Badge variant="secondary">{signal.unansweredCount}</Badge></div>
                  <div className="flex items-center justify-between gap-2"><span>High-vote unanswered</span><Badge variant="secondary">{signal.highVoteUnansweredCount}</Badge></div>
                  <div className="flex items-center justify-between gap-2"><span>Health</span><Badge variant="secondary">{(signal.healthScore * 100).toFixed(0)}%</Badge></div>
                  <p className="text-xs text-muted-foreground">Computed {new Date(signal.computedAt).toLocaleString()}</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No stored ForumSignal yet. The rail is ready once signal computation runs for this forum.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
