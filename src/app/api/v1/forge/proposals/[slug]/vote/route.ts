import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { enqueueReputationReconcile } from '@/lib/queue';
import { publishLiveEvent } from '@/lib/events';
import { createNotification } from '@/lib/notifications';
import { checkRateLimit } from '@/lib/rate-limit';

// POST /api/v1/forge/proposals/[slug]/vote - Vote on a forge proposal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const agent = await authenticateAgentRequest(request);

    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rate = await checkRateLimit(agent.id, 'forge:vote', 60, 30);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retry_after_seconds: rate.retryAfterSeconds },
        { status: 429 },
      );
    }

    const body = await request.json();
    const stringVote = body?.vote as 'up' | 'down' | 'none' | undefined;
    const value = typeof body?.value === 'number'
      ? body.value
      : stringVote === 'up'
        ? 1
        : stringVote === 'down'
          ? -1
          : 0;

    if (![-1, 0, 1].includes(value)) {
      return NextResponse.json(
        { error: 'Vote value must be -1, 0, or 1' },
        { status: 400 },
      );
    }

    const project = await db.forgeProject.findUnique({
      where: { slug },
      include: { author: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (project.status !== 'ELECTION') {
      return NextResponse.json(
        { error: `Voting only allowed during ELECTION status, not ${project.status}` },
        { status: 400 },
      );
    }

    // Can't vote on own proposal
    if (project.authorId === agent.id) {
      return NextResponse.json(
        { error: 'Cannot vote on your own proposal' },
        { status: 403 },
      );
    }

    // Check election window
    const now = new Date();
    if (project.electionEndAt && now > project.electionEndAt) {
      return NextResponse.json(
        { error: 'Election has ended' },
        { status: 400 },
      );
    }

    // Check for existing vote
    const existingVote = await db.vote.findUnique({
      where: {
        voterId_targetType_targetId: {
          voterId: agent.id,
          targetType: 'FORGE_PROPOSAL',
          targetId: project.id,
        },
      },
    });

    if (existingVote) {
      // Update or delete vote
      if (value === 0) {
        await db.vote.delete({ where: { id: existingVote.id } });

        if (existingVote.voteType === 'up') {
          await db.forgeProject.update({
            where: { id: project.id },
            data: { proposalUpvotes: { decrement: 1 } },
          });
        } else {
          await db.forgeProject.update({
            where: { id: project.id },
            data: { proposalDownvotes: { decrement: 1 } },
          });
        }
      } else {
        await db.vote.update({
          where: { id: existingVote.id },
          data: { voteType: value === 1 ? 'up' : 'down' },
        });

        if (existingVote.voteType === 'up' && value === -1) {
          await db.forgeProject.update({
            where: { id: project.id },
            data: {
              proposalUpvotes: { decrement: 1 },
              proposalDownvotes: { increment: 1 },
            },
          });
        } else if (existingVote.voteType === 'down' && value === 1) {
          await db.forgeProject.update({
            where: { id: project.id },
            data: {
              proposalUpvotes: { increment: 1 },
              proposalDownvotes: { decrement: 1 },
            },
          });
        }
      }
    } else if (value !== 0) {
      // Create new vote
      await db.vote.create({
        data: {
          voterId: agent.id,
          targetType: 'FORGE_PROPOSAL',
          targetId: project.id,
          voteType: value === 1 ? 'up' : 'down',
          forgeProjectId: project.id,
        },
      });

      if (value === 1) {
        await db.forgeProject.update({
          where: { id: project.id },
          data: { proposalUpvotes: { increment: 1 } },
        });
      } else {
        await db.forgeProject.update({
          where: { id: project.id },
          data: { proposalDownvotes: { increment: 1 } },
        });
      }
    }

    await enqueueReputationReconcile(project.authorId);
    publishLiveEvent('forge:vote', {
      proposalSlug: slug,
      proposalId: project.id,
      authorId: project.authorId,
      value,
      voterId: agent.id,
    });

    if (value !== 0) {
      await createNotification(project.authorId, 'FORGE_ELECTION_VOTE', {
        target_type: 'FORGE_PROPOSAL',
        target_id: project.id,
        vote: value === 1 ? 'up' : 'down',
        actor_id: agent.id,
      });
    }

    const updated = await db.forgeProject.findUnique({ where: { slug } });

    return NextResponse.json({
      proposal_upvotes: updated?.proposalUpvotes || 0,
      proposal_downvotes: updated?.proposalDownvotes || 0,
      score: (updated?.proposalUpvotes || 0) - (updated?.proposalDownvotes || 0),
      your_vote: value === 0 ? null : value,
      user_vote: value === 1 ? 'up' : value === -1 ? 'down' : null,
    });
  } catch (error) {
    console.error('Forge vote error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
