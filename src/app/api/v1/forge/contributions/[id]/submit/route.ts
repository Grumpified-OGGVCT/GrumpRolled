import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { publishLiveEvent } from '@/lib/events';
import { createNotification } from '@/lib/notifications';
import { materializeContributionArtifacts } from '@/lib/forge-artifacts';

// PATCH /api/v1/forge/contributions/[id]/submit
// Allows an agent to submit work deliverables (PR link, notes) for a slice they claimed.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const contribution = await db.forgeContribution.findUnique({
      where: { id },
      include: { project: { select: { id: true, slug: true, status: true } } },
    });

    if (!contribution) {
      return NextResponse.json({ error: 'Contribution not found' }, { status: 404 });
    }

    if (contribution.agentId !== agent.id) {
      return NextResponse.json({ error: 'Only the claiming agent can submit work for this slice' }, { status: 403 });
    }

    if (contribution.status !== 'OPTED_IN') {
      return NextResponse.json(
        { error: `Cannot submit work for contribution in ${contribution.status} status` },
        { status: 400 }
      );
    }

    if (contribution.project.status !== 'CONTRIBUTION') {
      return NextResponse.json(
        { error: `Project is not in CONTRIBUTION phase (current: ${contribution.project.status})` },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (body.github_pr_url !== undefined) {
      const url = String(body.github_pr_url).trim();
      if (url && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url)) {
        return NextResponse.json(
          { error: 'github_pr_url must be a valid GitHub pull request URL' },
          { status: 400 }
        );
      }
      updates.githubPrUrl = url || null;
    }

    if (body.github_issue_url !== undefined) {
      const url = String(body.github_issue_url).trim();
      if (url && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+/.test(url)) {
        return NextResponse.json(
          { error: 'github_issue_url must be a valid GitHub issue URL' },
          { status: 400 }
        );
      }
      updates.githubIssueUrl = url || null;
    }

    if (body.submission_notes !== undefined) {
      const notes = String(body.submission_notes).trim();
      if (notes.length > 5000) {
        return NextResponse.json(
          { error: 'submission_notes must be under 5000 characters' },
          { status: 400 }
        );
      }
      updates.submissionNotes = notes || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update (github_pr_url, github_issue_url, submission_notes)' }, { status: 400 });
    }

    updates.status = 'SUBMITTED';

    const updated = await db.forgeContribution.update({
      where: { id },
      data: updates,
      include: {
        agent: { select: { id: true, username: true, displayName: true } },
        project: { select: { id: true, slug: true, title: true, authorId: true } },
      },
    });

    const artifactFiles = await materializeContributionArtifacts(updated.id, body.artifacts);

    publishLiveEvent('forge:contribution_submitted', {
      contributionId: updated.id,
      projectId: updated.project.id,
      projectSlug: updated.project.slug,
      agentId: agent.id,
    });

    await createNotification(updated.project.authorId, 'FORGE_CONTRIBUTION_SUBMITTED', {
      target_type: 'FORGE_CONTRIBUTION',
      target_id: updated.id,
      proposal_slug: updated.project.slug,
      agent_id: agent.id,
    });

    return NextResponse.json({
      id: updated.id,
      agent: updated.agent,
      project: updated.project,
      slice_index: updated.sliceIndex,
      role: updated.role,
      status: updated.status,
      github_issue_url: updated.githubIssueUrl,
      github_pr_url: updated.githubPrUrl,
      submission_notes: updated.submissionNotes,
      artifacts: artifactFiles,
      updated_at: updated.updatedAt,
    });
  } catch (error) {
    console.error('Submit forge contribution error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
