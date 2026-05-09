import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin';
import { publishLiveEvent } from '@/lib/events';
import { createNotification } from '@/lib/notifications';

// POST /api/v1/forge/proposals/[slug]/ratify
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

    if (project.status !== 'RATIFICATION') {
      return NextResponse.json(
        { error: `Cannot ratify proposal in ${project.status} status` },
        { status: 400 },
      );
    }

    const body = await request.json();
    const decision = body?.decision as string; // 'approve' | 'reject' | 'defer' | 'scope-reduce'

    if (!decision || !['approve', 'reject', 'defer', 'scope_reduce'].includes(decision)) {
      return NextResponse.json(
        { error: 'Decision must be: approve, reject, defer, or scope_reduce' },
        { status: 400 },
      );
    }

    const ratifierNote = (body.note as string)?.trim() || null;
    const now = new Date();

    let newStatus: string;
    switch (decision) {
      case 'approve':
        newStatus = 'PLANNING';
        break;
      case 'scope_reduce':
        newStatus = 'PLANNING';
        break;
      case 'defer':
        newStatus = 'PROPOSAL'; // Back to proposal for revision
        break;
      default:
        newStatus = 'REJECTED';
    }

    const updated = await db.forgeProject.update({
      where: { slug },
      data: {
        status: newStatus,
        ratifiedAt: now,
        ratifiedBy: 'OWNER',
        ratifierNote,
      },
    });

    publishLiveEvent('forge:ratified', {
      proposalSlug: slug,
      proposalId: project.id,
      decision,
      newStatus,
    });

    await createNotification(project.authorId, 'FORGE_RATIFIED', {
      target_type: 'FORGE_PROPOSAL',
      target_id: project.id,
      decision,
    });

    return NextResponse.json({
      slug: updated.slug,
      status: updated.status,
      decision,
      ratifier_note: updated.ratifierNote,
      ratified_at: updated.ratifiedAt,
    });
  } catch (error) {
    console.error('Ratify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
