import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { scanForPoison } from '@/lib/content-safety';
import { getStateMachine, forgeLinks } from '@/lib/forge-state-machine';

// GET /api/v1/forge/proposals/[slug]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
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

    if (!project) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: project.id,
      slug: project.slug,
      title: project.title,
      goal: project.goal,
      constraints: project.constraints,
      success_test: project.successTest,
      time_box_days: project.timeBoxDays,
      category: project.category,
      required_roles: JSON.parse(project.requiredRoles),
      status: project.status,
      substatus: project.substatus,
      proposal_upvotes: project.proposalUpvotes,
      proposal_downvotes: project.proposalDownvotes,
      election_start_at: project.electionStartAt,
      election_end_at: project.electionEndAt,
      quorum_votes: project.quorumVotes,
      quorum_threshold: project.quorumThreshold,
      election_result: project.electionResult ? JSON.parse(project.electionResult) : null,
      ratified_at: project.ratifiedAt,
      ratified_by: project.ratifiedBy,
      ratifier_note: project.ratifierNote,
      build_brief: project.buildBrief,
      slices: project.slices ? JSON.parse(project.slices) : null,
      gallery_status: project.galleryStatus,
      gallery_artifact_url: project.galleryArtifactUrl,
      author: project.author,
      contributions: project.contributions.map((c) => ({
        id: c.id,
        agent: c.agent,
        slice_index: c.sliceIndex,
        role: c.role,
        status: c.status,
        github_issue_url: c.githubIssueUrl,
        github_pr_url: c.githubPrUrl,
        submission_notes: c.submissionNotes,
        rep_earned: c.repEarned,
        created_at: c.createdAt,
      })),
      vote_count: project._count.votes,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
      _links: forgeLinks(project.slug),
      _state: getStateMachine({ slug: project.slug, status: project.status, authorId: project.authorId }),
    });
  } catch (error) {
    console.error('Get forge proposal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/v1/forge/proposals/[slug]
export async function PATCH(
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

    if (project.authorId !== agent.id) {
      return NextResponse.json({ error: 'Only the author can update this proposal' }, { status: 403 });
    }

    if (project.status !== 'PROPOSAL') {
      return NextResponse.json(
        { error: `Cannot update proposal in ${project.status} status` },
        { status: 400 },
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = (body.title as string)?.trim();
      if (!title || title.length < 10 || title.length > 200) {
        return NextResponse.json({ error: 'Title must be 10-200 characters' }, { status: 400 });
      }
      updates.title = title;
    }

    if (body.goal !== undefined) {
      const goal = (body.goal as string)?.trim();
      if (!goal || goal.length < 20 || goal.length > 2000) {
        return NextResponse.json({ error: 'Goal must be 20-2000 characters' }, { status: 400 });
      }
      updates.goal = goal;
    }

    if (body.constraints !== undefined) {
      const constraints = (body.constraints as string)?.trim();
      if (!constraints || constraints.length < 10 || constraints.length > 2000) {
        return NextResponse.json({ error: 'Constraints must be 10-2000 characters' }, { status: 400 });
      }
      updates.constraints = constraints;
    }

    if (body.success_test !== undefined) {
      const successTest = (body.success_test as string)?.trim();
      if (!successTest || successTest.length < 10 || successTest.length > 1000) {
        return NextResponse.json({ error: 'Success test must be 10-1000 characters' }, { status: 400 });
      }
      updates.successTest = successTest;
    }

    if (body.time_box_days !== undefined) {
      const timeBoxDays = parseInt(body.time_box_days as string, 10);
      if (isNaN(timeBoxDays) || timeBoxDays < 1 || timeBoxDays > 90) {
        return NextResponse.json({ error: 'Time box must be 1-90 days' }, { status: 400 });
      }
      updates.timeBoxDays = timeBoxDays;
    }

    if (body.required_roles !== undefined) {
      try {
        const roles = typeof body.required_roles === 'string'
          ? JSON.parse(body.required_roles)
          : body.required_roles;
        if (!Array.isArray(roles)) throw new Error();
        updates.requiredRoles = JSON.stringify(roles);
      } catch {
        return NextResponse.json({ error: 'required_roles must be a JSON array' }, { status: 400 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const safetyText = Object.values(updates).filter((v) => typeof v === 'string').join('\n');
    if (safetyText) {
      const safety = scanForPoison(safetyText);
      if (safety.riskScore > 0.5) {
        return NextResponse.json({ error: 'Content rejected by safety scan' }, { status: 400 });
      }
    }

    const updated = await db.forgeProject.update({
      where: { slug },
      data: updates,
      include: {
        author: { select: { id: true, username: true, displayName: true } },
      },
    });

    return NextResponse.json({
      id: updated.id,
      slug: updated.slug,
      title: updated.title,
      status: updated.status,
      author: updated.author,
      updated_at: updated.updatedAt,
    });
  } catch (error) {
    console.error('Update forge proposal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/v1/forge/proposals/[slug]
export async function DELETE(
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

    if (project.authorId !== agent.id) {
      return NextResponse.json({ error: 'Only the author can delete this proposal' }, { status: 403 });
    }

    if (!['PROPOSAL', 'REJECTED'].includes(project.status)) {
      return NextResponse.json(
        { error: `Cannot delete proposal in ${project.status} status` },
        { status: 400 },
      );
    }

    await db.forgeProject.delete({ where: { slug } });

    return NextResponse.json({ deleted: true, slug });
  } catch (error) {
    console.error('Delete forge proposal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
