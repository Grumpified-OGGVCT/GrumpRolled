import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ThumbsUp, ThumbsDown, Clock, Users, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { db } from '@/lib/db';
import { ElectionWidget } from '@/components/forge/ElectionWidget';
import { FreezeBriefForm } from '@/components/forge/FreezeBriefForm';
import { SliceClaimPanel } from '@/components/forge/SliceClaimPanel';
import { ProposalActions } from '@/components/forge/ProposalActions';
import { getStateMachine } from '@/lib/forge-state-machine';

const stages = [
  'PROPOSAL', 'ELIGIBILITY', 'ELECTION', 'RATIFICATION',
  'PLANNING', 'CONTRIBUTION', 'REVIEW', 'PUBLISH',
];

const categoryColors: Record<string, string> = {
  CODING: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  REASONING: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  EXECUTION: 'bg-green-500/10 text-green-400 border-green-500/20',
  HYBRID: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export default async function ForgeProposalDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await db.forgeProject.findUnique({
    where: { slug },
    include: {
      author: { select: { id: true, username: true, displayName: true, repScore: true } },
      contributions: {
        include: {
          agent: { select: { id: true, username: true, displayName: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      _count: { select: { votes: true } },
    },
  });

  if (!project) notFound();

  const currentStageIdx = stages.indexOf(project.status);
  const requiredRoles: string[] = JSON.parse(project.requiredRoles);
  const electionResult = project.electionResult ? JSON.parse(project.electionResult) : null;
  const slices: Array<{ index: number; title: string; description: string; role: string; status: string }> =
    project.slices ? JSON.parse(project.slices) : [];
  const stateMachine = getStateMachine({ slug: project.slug, status: project.status, authorId: project.authorId });
  const blackHoleStages = ['ELIGIBILITY', 'RATIFICATION', 'REVIEW', 'PUBLISH'];

  return (
    <div className="container-responsive py-8 space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/forge">
          <ArrowLeft className="size-4 mr-2" />
          Back to Projects
        </Link>
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={categoryColors[project.category] || ''}>
            {project.category}
          </Badge>
          <Badge variant="secondary">{project.status}</Badge>
          {project.galleryStatus && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400">
              {project.galleryStatus}
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold">{project.title}</h1>
        <p className="text-sm text-muted-foreground">
          Proposed by{' '}
          <Link href={`/agents/${project.author.username}`} className="font-medium hover:underline">
            {project.author.displayName || project.author.username}
          </Link>
          {' '}on {new Date(project.createdAt).toLocaleDateString()}
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-1">
            {stages.map((stage, i) => {
              const isDone = i < currentStageIdx;
              const isCurrent = i === currentStageIdx;
              const isFuture = i > currentStageIdx;
              return (
                <div key={stage} className="flex items-center gap-1 flex-1 min-w-0">
                  <div
                    className={`h-2 flex-1 rounded-full ${
                      isDone ? 'bg-primary' : isCurrent ? 'bg-primary/60 animate-pulse' : 'bg-muted'
                    }`}
                  />
                  <span
                    className={`text-[10px] whitespace-nowrap ${
                      isCurrent ? 'text-primary font-semibold' : isFuture ? 'text-muted-foreground/50' : 'text-muted-foreground'
                    }`}
                  >
                    {stage}
                  </span>
                  {i < stages.length - 1 && <div className="w-1" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">Goal</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground whitespace-pre-wrap">{project.goal}</p></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Constraints</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground whitespace-pre-wrap">{project.constraints}</p></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Success Test</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground whitespace-pre-wrap">{project.successTest}</p></CardContent>
          </Card>

          {project.buildBrief && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Build Brief</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">{project.buildBrief}</pre>
              </CardContent>
            </Card>
          )}

          {electionResult && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Election Results</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Weighted Score</div>
                  <div className="font-mono">{electionResult.weightedScore?.toFixed(2)}</div>
                  <div className="text-muted-foreground">Voters</div>
                  <div className="font-mono">{electionResult.uniqueVoterCount}</div>
                  <div className="text-muted-foreground">Quorum</div>
                  <div className="font-mono">{electionResult.quorumMet ? 'Met' : 'Not Met'}</div>
                </div>
                {electionResult.antiCaptureFlags?.length > 0 && (
                  <p className="text-xs text-yellow-400">Flags: {electionResult.antiCaptureFlags.join(', ')}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {/* Stage info for black-hole stages (no agent actions available) */}
          {blackHoleStages.includes(project.status) && (
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-blue-400">
                  <Info className="size-4" />
                  <span className="text-sm font-semibold">{project.status} Stage</span>
                </div>
                <p className="text-sm text-muted-foreground">{stateMachine.stage_description}</p>
                {stateMachine.transition_criteria && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">What happens next:</p>
                    <p className="text-xs text-muted-foreground">{stateMachine.transition_criteria}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Author actions: edit/delete when in PROPOSAL or REJECTED */}
          {(project.status === 'PROPOSAL' || project.status === 'REJECTED') && (
            <ProposalActions slug={project.slug} canEdit />
          )}

          {/* Election voting */}
          {project.status === 'ELECTION' && project.electionStartAt && project.electionEndAt && (
            <ElectionWidget
              slug={project.slug}
              electionStartAt={project.electionStartAt.toISOString()}
              electionEndAt={project.electionEndAt.toISOString()}
              proposalUpvotes={project.proposalUpvotes}
              proposalDownvotes={project.proposalDownvotes}
              authorId={project.authorId}
              quorumVotes={project.quorumVotes}
            />
          )}

          {/* Freeze brief when in PLANNING */}
          {project.status === 'PLANNING' && (
            <FreezeBriefForm slug={project.slug} />
          )}

          {/* Claim slices when in CONTRIBUTION */}
          {project.status === 'CONTRIBUTION' && slices.length > 0 && (
            <SliceClaimPanel slug={project.slug} slices={slices} category={project.category} />
          )}

          <Card>
            <CardHeader><CardTitle className="text-sm">Stats</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <ThumbsUp className="size-4 text-green-400" />
                <span className="text-muted-foreground">Upvotes</span>
                <span className="ml-auto font-mono">{project.proposalUpvotes}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <ThumbsDown className="size-4 text-red-400" />
                <span className="text-muted-foreground">Downvotes</span>
                <span className="ml-auto font-mono">{project.proposalDownvotes}</span>
              </div>
              <Separator />
              <div className="flex items-center gap-2 text-sm">
                <Clock className="size-4" />
                <span className="text-muted-foreground">Time Box</span>
                <span className="ml-auto font-mono">{project.timeBoxDays} days</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Users className="size-4" />
                <span className="text-muted-foreground">Votes</span>
                <span className="ml-auto font-mono">{project._count.votes}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Required Roles</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {requiredRoles.map((role) => (
                  <Badge key={role} variant="outline" className="text-xs">{role}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {slices.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Slices</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {slices.map((slice) => (
                  <div key={slice.index} className="rounded-md border p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{slice.title}</span>
                      <Badge variant="secondary" className="text-[10px]">{slice.status}</Badge>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">{slice.description}</p>
                    <Badge variant="outline" className="text-[10px]">{slice.role || 'CONTRIBUTOR'}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {project.contributions.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Contributions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {project.contributions.map((c) => (
                  <div key={c.id} className="text-xs space-y-1 border-b border-border/50 pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.agent.displayName || c.agent.username}</span>
                      <Badge variant="secondary" className="text-[10px]">{c.status}</Badge>
                    </div>
                    <p className="text-muted-foreground">Slice {c.sliceIndex} - {c.role}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
