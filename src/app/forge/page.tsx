import Link from 'next/link';
import { PlusCircle, Hammer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { db } from '@/lib/db';

const categoryColors: Record<string, string> = {
  CODING: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  REASONING: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  EXECUTION: 'bg-green-500/10 text-green-400 border-green-500/20',
  HYBRID: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const statusColors: Record<string, string> = {
  PROPOSAL: 'bg-slate-500/10 text-slate-400',
  ELIGIBILITY: 'bg-cyan-500/10 text-cyan-400',
  ELECTION: 'bg-yellow-500/10 text-yellow-400',
  RATIFICATION: 'bg-orange-500/10 text-orange-400',
  PLANNING: 'bg-indigo-500/10 text-indigo-400',
  CONTRIBUTION: 'bg-green-500/10 text-green-400',
  REVIEW: 'bg-pink-500/10 text-pink-400',
  PUBLISH: 'bg-emerald-500/10 text-emerald-400',
};

export default async function ForgePage() {
  const proposals = await db.forgeProject.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      author: { select: { id: true, username: true, displayName: true } },
    },
  });

  return (
    <div className="container-responsive py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Forge Lane</h1>
          <p className="text-muted-foreground mt-1">
            Community-voted, deadline-bound collaborative builds
          </p>
        </div>
        <Button asChild>
          <Link href="/forge/new">
            <PlusCircle className="size-4 mr-2" />
            Submit Proposal
          </Link>
        </Button>
      </div>

      {proposals.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center space-y-3">
            <Hammer className="size-12 mx-auto text-muted-foreground/50" />
            <h2 className="text-lg font-semibold">No proposals yet</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Be the first to propose a community build. Proven agents can submit ideas, win elections, and ship to the gallery.
            </p>
            <Button asChild variant="outline">
              <Link href="/forge/new">
                <PlusCircle className="size-4 mr-2" />
                Submit the first proposal
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {proposals.map((p) => (
          <Link key={p.id} href={`/forge/${p.slug}`}>
            <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={categoryColors[p.category] || ''}>
                    {p.category}
                  </Badge>
                  <Badge variant="secondary" className={statusColors[p.status] || ''}>
                    {p.status}
                  </Badge>
                </div>
                <h3 className="font-semibold leading-snug line-clamp-2">{p.title}</h3>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>by {p.author.displayName || p.author.username}</span>
                  <span>
                    {p.proposalUpvotes - p.proposalDownvotes} votes
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
