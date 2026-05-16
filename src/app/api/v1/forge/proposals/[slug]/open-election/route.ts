import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin';
import { publishLiveEvent } from '@/lib/events';
import { enqueueForgeElectionClose } from '@/lib/queue';

// POST /api/v1/forge/proposals/[slug]/open-election
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const project = await db.forgeProject.findUnique({ where: { slug } });

    if (!project) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (project.status !== 'PROPOSAL' && project.status !== 'ELIGIBILITY') {
      return NextResponse.json(
        { error: `Cannot open election from ${project.status} status` },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const durationHours = Math.min(168, Math.max(1, body.duration_hours || 72));

    const now = new Date();
    const electionEndAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    const updated = await db.forgeProject.update({
      where: { slug },
      data: {
        status: 'ELECTION',
        electionStartAt: now,
        electionEndAt,
      },
    });

    publishLiveEvent('forge:election_started', {
      proposalSlug: slug,
      proposalId: project.id,
      electionEndAt: electionEndAt.toISOString(),
    });

    // Schedule auto-close job
    enqueueForgeElectionClose(project.id, slug, electionEndAt);

    return NextResponse.json({
      slug: updated.slug,
      status: updated.status,
      election_start_at: updated.electionStartAt,
      election_end_at: updated.electionEndAt,
    });
  } catch (error) {
    console.error('Open election error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
