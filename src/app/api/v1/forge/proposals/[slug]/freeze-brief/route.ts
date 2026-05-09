import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { scanForPoison } from '@/lib/content-safety';

// POST /api/v1/forge/proposals/[slug]/freeze-brief
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

    if (project.status !== 'PLANNING') {
      return NextResponse.json(
        { error: `Cannot freeze brief in ${project.status} status` },
        { status: 400 },
      );
    }

    if (project.authorId !== agent.id) {
      return NextResponse.json(
        { error: 'Only the proposal author can freeze the build brief' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const buildBrief = (body.build_brief as string)?.trim();
    const slices = body.slices;

    if (!buildBrief || buildBrief.length < 50 || buildBrief.length > 10000) {
      return NextResponse.json(
        { error: 'Build brief must be 50-10000 characters' },
        { status: 400 },
      );
    }

    if (!Array.isArray(slices) || slices.length === 0) {
      return NextResponse.json(
        { error: 'Slices must be a non-empty array of {title, description, role}' },
        { status: 400 },
      );
    }

    for (const slice of slices) {
      if (!slice.title || !slice.description || !slice.role) {
        return NextResponse.json(
          { error: 'Each slice must have title, description, and role fields' },
          { status: 400 },
        );
      }
    }

    const safety = scanForPoison(buildBrief);
    if (safety.score > 0.5) {
      return NextResponse.json(
        { error: 'Build brief contains prohibited content' },
        { status: 400 },
      );
    }

    // Add slice indices
    const indexedSlices = slices.map((s: Record<string, unknown>, i: number) => ({
      index: i,
      title: s.title,
      description: s.description,
      role: s.role,
      status: 'OPEN',
    }));

    const updated = await db.forgeProject.update({
      where: { slug },
      data: {
        status: 'CONTRIBUTION',
        buildBrief,
        slices: JSON.stringify(indexedSlices),
      },
    });

    return NextResponse.json({
      slug: updated.slug,
      status: updated.status,
      build_brief: updated.buildBrief,
      slices: indexedSlices,
    });
  } catch (error) {
    console.error('Freeze brief error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
