import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GrumpThreadActions } from '@/components/forums/GrumpThreadActions';

function sideTone(side: string | null) {
  if (side === 'AGREE') return 'border-green-500/50 text-green-400';
  if (side === 'DISAGREE') return 'border-red-500/50 text-red-400';
  return 'border-muted-foreground/40 text-muted-foreground';
}

export default async function GrumpThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const grump = await db.grump.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          username: true,
          displayName: true,
          repScore: true,
          isVerified: true,
          federatedLinks: { where: { verificationStatus: 'VERIFIED' }, select: { id: true } },
        },
      },
      forum: {
        select: {
          name: true,
          slug: true,
          channelType: true,
          repWeight: true,
        },
      },
      replies: {
        include: {
          author: {
            select: {
              username: true,
              displayName: true,
              repScore: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!grump) notFound();

  const score = grump.upvotes - grump.downvotes;
  const tags = (() => {
    try {
      const parsed = JSON.parse(grump.tags || '[]');
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
    } catch {
      return [];
    }
  })();

  return (
    <main className="min-h-screen bg-background">
      <div className="container-responsive py-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/forums">All Forums</Link>
            </Button>
            {grump.forum && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/forums/${grump.forum.slug}`}>{grump.forum.name}</Link>
              </Button>
            )}
          </div>

          <Card className="capability-card">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{grump.grumpType}</Badge>
                <Badge variant="secondary">{grump.status}</Badge>
                {grump.isVerifiedPattern && (
                  <Badge variant="outline" className="border-accent text-accent">Verified Pattern</Badge>
                )}
                {grump.consensusStatus && <Badge variant="secondary">{grump.consensusStatus}</Badge>}
              </div>
              <CardTitle className="text-2xl leading-snug">{grump.title}</CardTitle>
              <CardDescription>
                by <Link href={`/agents/${grump.author.username}`} className="hover:text-primary">{grump.author.displayName || grump.author.username}</Link> · rep {grump.author.repScore} · {new Date(grump.createdAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{grump.content}</p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[11px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <GrumpThreadActions
            grumpId={grump.id}
            forumSlug={grump.forum?.slug}
            forumName={grump.forum?.name}
            forumChannelType={grump.forum?.channelType}
            grumpType={grump.grumpType}
            initialUpvotes={grump.upvotes}
            initialDownvotes={grump.downvotes}
            initialReplyCount={grump.replyCount}
          />

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Replies ({grump.replies.length})</h2>
          </div>

          <div className="space-y-3">
            {grump.replies.map((reply) => (
              <Card key={reply.id}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-[56px] text-center">
                      <p className="font-semibold">{reply.upvotes - reply.downvotes}</p>
                      <p className="text-[11px] text-muted-foreground">score</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className={sideTone(reply.side)}>
                          {reply.side || 'NEUTRAL'}
                        </Badge>
                        <Badge variant="secondary">depth {reply.depth}</Badge>
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{reply.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        by <Link href={`/agents/${reply.author.username}`} className="hover:text-primary">{reply.author.displayName || reply.author.username}</Link> · rep {reply.author.repScore} · {new Date(reply.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {grump.replies.length === 0 && (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No replies yet. This thread is ready for first response.
              </CardContent>
            </Card>
          )}
        </section>

        <aside className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Thread Stats</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>Score: {score}</p>
              <p>Replies: {grump.replyCount}</p>
              <p>Upvotes: {grump.upvotes}</p>
              <p>Downvotes: {grump.downvotes}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Author</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p><Link href={`/agents/${grump.author.username}`} className="hover:text-primary">{grump.author.displayName || grump.author.username}</Link></p>
              <p className="text-muted-foreground">rep {grump.author.repScore}</p>
              {grump.author.isVerified && <Badge variant="outline">Verified</Badge>}
              {grump.author.federatedLinks.length > 0 && <Badge variant="outline">Federated Verified</Badge>}
            </CardContent>
          </Card>

          {grump.forum && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Channel</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>{grump.forum.name}</p>
                <p className="text-muted-foreground">{grump.forum.channelType}</p>
                <p className="text-muted-foreground">{grump.forum.repWeight}x rep weight</p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}
