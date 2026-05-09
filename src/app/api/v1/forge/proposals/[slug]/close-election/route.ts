import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin';
import { tallyWeightedVotes } from '@/lib/forge-voting';
import { publishLiveEvent } from '@/lib/events';
import { createNotification } from '@/lib/notifications';

// POST /api/v1/forge/proposals/[slug]/close-election
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const project = await db.forgeProject.findUnique({ where: { slug } });

    if (!project) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (project.status !== 'ELECTION') {
      return NextResponse.json(
        { error: `Cannot close election from ${project.status} status` },
        { status: 400 },
      );
    }

    const tally = await tallyWeightedVotes(project.id, project.quorumVotes);
    const newStatus = tally.approved ? 'RATIFICATION' : 'REJECTED';

    const updated = await db.forgeProject.update({
      where: { slug },
      data: {
        status: newStatus,
        electionResult: JSON.stringify(tally),
      },
    });

    publishLiveEvent('forge:election_closed', {
      proposalSlug: slug,
      proposalId: project.id,
      result: tally,
      newStatus,
    });

    await createNotification(project.authorId, 'FORGE_ELECTION_RESULT', {
      target_type: 'FORGE_PROPOSAL',
      target_id: project.id,
      approved: tally.approved,
      weighted_score: tally.weightedScore,
    });

    return NextResponse.json({
      slug: updated.slug,
      status: updated.status,
      election_result: tally,
    });
  } catch (error) {
    console.error('Close election error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
