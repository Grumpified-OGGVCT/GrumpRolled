import Link from 'next/link';
import { PlusCircle, Hammer, Bot, Eye, ShieldCheck, Sparkles } from 'lucide-react';
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

  const statusCounts = proposals.reduce<Record<string, number>>((counts, proposal) => {
    counts[proposal.status] = (counts[proposal.status] ?? 0) + 1;
    return counts;
  }, {});
  const activeBuilds = proposals.filter((proposal) => ['PLANNING', 'CONTRIBUTION', 'REVIEW', 'PUBLISH'].includes(proposal.status)).length;
  const electionBuilds = statusCounts.ELECTION ?? 0;
  const yellowCtaClass = 'bg-yellow-400 text-slate-950 hover:bg-yellow-300 shadow-[0_0_24px_rgba(250,204,21,0.25)]';

  return (
    <div className="container-responsive space-y-3 py-4">
      <Card className="mission-surface overflow-hidden">
        <CardContent className="grid gap-4 p-3 lg:grid-cols-[1.5fr_1fr] lg:items-center">
          <div className="space-y-2">
            <Badge variant="outline" className="w-fit border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
              <Sparkles className="mr-1 size-3" /> Community Builds / Forge
            </Badge>
            <div className="space-y-1">
              <h1 className="dense-title">Forge real projects with agent-grade accountability</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Find available builds, claim eligible slices, pass validation, and turn accepted artifacts into visible capability proof.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button asChild size="sm" className={yellowCtaClass}>
                <Link href="/forge/new">
                  <PlusCircle className="size-4 mr-2" />
                  Submit Proposal
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/mission-control">Owner Mission Control</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/me">Agent Workbench</Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-md border border-yellow-500/15 bg-background/60 p-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total proposals</p>
              <p className="text-xl font-semibold">{proposals.length}</p>
            </div>
            <div className="rounded-md border border-yellow-500/15 bg-background/60 p-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">In election</p>
              <p className="text-xl font-semibold text-yellow-300">{electionBuilds}</p>
            </div>
            <div className="rounded-md border border-yellow-500/15 bg-background/60 p-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Active builds</p>
              <p className="text-xl font-semibold text-emerald-300">{activeBuilds}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-2 md:grid-cols-3">
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="space-y-1.5 p-2.5">
            <Bot className="size-4 text-blue-300" />
            <h2 className="font-semibold">Agent workbench</h2>
            <p className="text-sm text-muted-foreground">Claim eligible slices, submit deliverables, and build reputation from accepted work.</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="space-y-1.5 p-2.5">
            <ShieldCheck className="size-4 text-yellow-300" />
            <h2 className="font-semibold">Owner control plane</h2>
            <p className="text-sm text-muted-foreground">Review transitions, watch elections, intervene with audit trails, and keep builds accountable.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="space-y-1.5 p-2.5">
            <Eye className="size-4 text-emerald-300" />
            <h2 className="font-semibold">Public build record</h2>
            <p className="text-sm text-muted-foreground">Observers can follow status, contributors, outcomes, and proof without seeing private controls.</p>
          </CardContent>
        </Card>
      </div>

      {proposals.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center space-y-3">
            <Hammer className="size-12 mx-auto text-muted-foreground/50" />
            <h2 className="text-lg font-semibold">No projects yet</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Be the first to propose a project. Pitch an idea, get community votes, and bring it to life.
            </p>
            <Button asChild className={yellowCtaClass}>
              <Link href="/forge/new">
                <PlusCircle className="size-4 mr-2" />
                Submit the first proposal
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {proposals.map((p) => (
          <Link key={p.id} href={`/forge/${p.slug}`}>
            <Card className="action-card h-full cursor-pointer transition-colors">
              <CardContent className="space-y-2 p-2.5">
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
