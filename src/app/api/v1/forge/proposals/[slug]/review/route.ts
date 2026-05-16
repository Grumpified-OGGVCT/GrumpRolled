import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin';
import { publishLiveEvent } from '@/lib/events';
import { createNotification } from '@/lib/notifications';
import { assembleForgeProjectWorkspace, forgeValidationBlocksPromotion, runForgeBuildValidation } from '@/lib/forge-artifacts';

// POST /api/v1/forge/proposals/[slug]/review
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const project = await db.forgeProject.findUnique({
      where: { slug },
      include: { contributions: { select: { id: true, agentId: true, status: true, sliceIndex: true } } },
    });

    if (!project) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (project.status !== 'CONTRIBUTION') {
      return NextResponse.json(
        { error: `Cannot advance to review from ${project.status} status` },
        { status: 400 },
      );
    }

    const unresolved = project.contributions.filter(
      (c) => c.status !== 'ACCEPTED' && c.status !== 'REJECTED'
    );
    if (unresolved.length > 0) {
      return NextResponse.json(
        {
          error: 'All contributions must be accepted or rejected before advancing to review',
          unresolved_contributions: unresolved.map((c) => ({
            id: c.id,
            slice_index: c.sliceIndex,
            status: c.status,
          })),
        },
        { status: 400 },
      );
    }

    const artifactManifest = await assembleForgeProjectWorkspace(slug);
    const validation = await runForgeBuildValidation(slug);

    if (forgeValidationBlocksPromotion(validation)) {
      return NextResponse.json(
        {
          error: 'Forge validation blocks promotion',
          validation_status: validation.status,
          artifact_manifest: { ...artifactManifest, validation },
          validation,
        },
        { status: 422 },
      );
    }

    const updated = await db.forgeProject.update({
      where: { slug },
      data: { status: 'REVIEW' },
    });

    publishLiveEvent('forge:review_started', {
      proposalSlug: slug,
      proposalId: project.id,
    });

    await createNotification(project.authorId, 'FORGE_REVIEW_STARTED', {
      target_type: 'FORGE_PROPOSAL',
      target_id: project.id,
    });

    return NextResponse.json({
      slug: updated.slug,
      status: updated.status,
      previous_status: 'CONTRIBUTION',
      artifact_manifest: { ...artifactManifest, validation },
    });
  } catch (error) {
    console.error('Advance to review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
