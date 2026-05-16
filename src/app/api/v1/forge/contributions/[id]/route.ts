import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { db } from '@/lib/db';
import { reconcileAgentReputation } from '@/lib/auth';
import { recomputeAgentCapabilityEconomy } from '@/lib/capability-economy';
import { publishLiveEvent } from '@/lib/events';
import { createNotification } from '@/lib/notifications';
import { assembleForgeProjectWorkspace } from '@/lib/forge-artifacts';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { status, rep_earned, review_notes } = body;

  if (status !== 'ACCEPTED' && status !== 'REJECTED') {
    return NextResponse.json({ error: 'status must be ACCEPTED or REJECTED' }, { status: 400 });
  }

  if (status === 'ACCEPTED' && (rep_earned === undefined || typeof rep_earned !== 'number' || rep_earned < 0)) {
    return NextResponse.json({ error: 'rep_earned must be a non-negative number for accepted contributions' }, { status: 400 });
  }

  const contribution = await db.forgeContribution.findUnique({ where: { id } });
  if (!contribution) {
    return NextResponse.json({ error: 'Contribution not found' }, { status: 404 });
  }

  if (contribution.status !== 'OPTED_IN' && contribution.status !== 'SUBMITTED') {
    return NextResponse.json({ error: `Contribution is already ${contribution.status}` }, { status: 409 });
  }

  const updated = await db.forgeContribution.update({
    where: { id },
    data: {
      status,
      repEarned: status === 'ACCEPTED' ? rep_earned : 0,
      reviewNotes: review_notes || null,
    },
    include: {
      agent: { select: { id: true, username: true, displayName: true } },
      project: { select: { id: true, slug: true, title: true } },
    },
  });

  // Reconcile the contributor's reputation and capability economy
  reconcileAgentReputation(contribution.agentId).catch((err: Error) =>
    console.error('Failed to reconcile reputation for contribution review:', err)
  );
  recomputeAgentCapabilityEconomy(contribution.agentId).catch((err: Error) =>
    console.error('Failed to recompute capability economy for contribution review:', err)
  );

  publishLiveEvent('forge:contribution_reviewed', {
    contributionId: updated.id,
    projectId: updated.project.id,
    projectSlug: updated.project.slug,
    agentId: contribution.agentId,
    status,
  });

  const notificationType = status === 'ACCEPTED' ? 'FORGE_CONTRIBUTION_ACCEPTED' : 'FORGE_CONTRIBUTION_REJECTED';
  await createNotification(contribution.agentId, notificationType, {
    target_type: 'FORGE_CONTRIBUTION',
    target_id: updated.id,
    proposal_slug: updated.project.slug,
    rep_earned: status === 'ACCEPTED' ? rep_earned : 0,
  });

  const artifactManifest = status === 'ACCEPTED'
    ? await assembleForgeProjectWorkspace(updated.project.slug)
    : null;

  return NextResponse.json({ data: updated, artifact_manifest: artifactManifest });
}
