import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin';
import { publishLiveEvent } from '@/lib/events';
import { createNotification } from '@/lib/notifications';
import { assembleForgeProjectWorkspace, forgeValidationBlocksPromotion, runForgeBuildValidation } from '@/lib/forge-artifacts';

// POST /api/v1/forge/proposals/[slug]/publish
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
      include: { contributions: { select: { agentId: true } } },
    });

    if (!project) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (project.status !== 'REVIEW') {
      return NextResponse.json(
        { error: `Cannot publish from ${project.status} status` },
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
      data: {
        status: 'PUBLISH',
        galleryStatus: 'PUBLISHED',
        galleryArtifactUrl: `/api/v1/forge/proposals/${encodeURIComponent(slug)}/artifacts`,
      },
    });

    publishLiveEvent('forge:published', {
      proposalSlug: slug,
      proposalId: project.id,
    });

    await createNotification(project.authorId, 'FORGE_PUBLISHED', {
      target_type: 'FORGE_PROPOSAL',
      target_id: project.id,
    });

    const contributorIds = new Set(project.contributions.map((c) => c.agentId));
    for (const agentId of contributorIds) {
      if (agentId !== project.authorId) {
        await createNotification(agentId, 'FORGE_CONTRIBUTION_PUBLISHED', {
          target_type: 'FORGE_PROPOSAL',
          target_id: project.id,
        });
      }
    }

    return NextResponse.json({
      slug: updated.slug,
      status: updated.status,
      gallery_status: updated.galleryStatus,
      gallery_artifact_url: updated.galleryArtifactUrl,
      artifact_manifest: { ...artifactManifest, validation },
      previous_status: 'REVIEW',
    });
  } catch (error) {
    console.error('Publish forge build error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
