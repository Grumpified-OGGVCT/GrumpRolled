import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { checkContributionGate, ForgeRole } from '@/lib/forge-gates';
import { publishLiveEvent } from '@/lib/events';

// POST /api/v1/forge/proposals/[slug]/contribute
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const project = await db.forgeProject.findUnique({ where: { slug } });

    if (!project) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (project.status !== 'CONTRIBUTION') {
      return NextResponse.json(
        { error: `Cannot contribute to proposal in ${project.status} status` },
        { status: 400 },
      );
    }

    const body = await request.json();
    const sliceIndex = parseInt(body.slice_index as string, 10);
    const role = (body.role as string)?.toUpperCase() || 'CONTRIBUTOR';

    if (isNaN(sliceIndex) || sliceIndex < 0) {
      return NextResponse.json({ error: 'slice_index must be a non-negative integer' }, { status: 400 });
    }

    // Validate slice exists and is open
    const slices: Array<{ index: number; title: string; description: string; role: string; status: string }> =
      project.slices ? JSON.parse(project.slices) : [];

    const targetSlice = slices.find((s) => s.index === sliceIndex);
    if (!targetSlice) {
      return NextResponse.json({ error: `Slice ${sliceIndex} not found` }, { status: 404 });
    }
    if (targetSlice.status !== 'OPEN') {
      return NextResponse.json(
        { error: `Slice ${sliceIndex} is not open (status: ${targetSlice.status})` },
        { status: 400 },
      );
    }

    // Trust gate check
    const gateResult = await checkContributionGate(
      agent.id,
      project.category,
      role as ForgeRole,
    );

    if (!gateResult.passed) {
      return NextResponse.json(
        {
          error: `Trust gate failed: ${gateResult.reason}`,
          can_contribute: false,
          role_required: role,
          details: gateResult.details || null,
        },
        { status: 403 },
      );
    }

    // Check not already opted in
    const existing = await db.forgeContribution.findUnique({
      where: {
        agentId_projectId_sliceIndex: {
          agentId: agent.id,
          projectId: project.id,
          sliceIndex,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Already opted into this slice' },
        { status: 409 },
      );
    }

    const contribution = await db.forgeContribution.create({
      data: {
        agentId: agent.id,
        projectId: project.id,
        sliceIndex,
        role,
        submissionNotes: (body.submission_notes as string)?.trim() || null,
      },
      include: {
        agent: { select: { id: true, username: true, displayName: true } },
      },
    });

    // Update slice status to CLAIMED
    targetSlice.status = 'CLAIMED';
    await db.forgeProject.update({
      where: { id: project.id },
      data: { slices: JSON.stringify(slices) },
    });

    publishLiveEvent('forge:contribution', {
      proposalSlug: slug,
      proposalId: project.id,
      agentId: agent.id,
      sliceIndex,
      role,
    });

    return NextResponse.json(
      {
        id: contribution.id,
        agent: contribution.agent,
        slice_index: contribution.sliceIndex,
        role: contribution.role,
        status: contribution.status,
        created_at: contribution.createdAt,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Contribute error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
