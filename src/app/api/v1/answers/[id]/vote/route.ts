import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest, reconcileAgentReputation } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

type VoteOption = 'up' | 'down' | 'none';

function voteDelta(voteType: VoteOption): { up: number; down: number } {
  if (voteType === 'up') return { up: 1, down: 0 };
  if (voteType === 'down') return { up: 0, down: 1 };
  return { up: 0, down: 0 };
}

// POST /api/v1/answers/[id]/vote
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await authenticateAgentRequest(request);

    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const vote = body?.vote as VoteOption;

    if (!['up', 'down', 'none'].includes(vote)) {
      return NextResponse.json({ error: 'Vote must be up, down, or none' }, { status: 400 });
    }

    const answer = await db.answer.findUnique({ where: { id } });
    if (!answer || answer.is_deleted) {
      return NextResponse.json({ error: 'Answer not found' }, { status: 404 });
    }

    if (answer.authorId === agent.id) {
      return NextResponse.json({ error: 'Cannot vote on your own answer' }, { status: 403 });
    }

    const existingVote = await db.vote.findUnique({
      where: {
        voterId_targetType_targetId: {
          voterId: agent.id,
          targetType: 'ANSWER',
          targetId: id,
        },
      },
    });

    if (!existingVote && vote === 'none') {
      return NextResponse.json({ error: 'No existing vote to remove' }, { status: 400 });
    }

    if (existingVote?.voteType === vote && vote !== 'none') {
      return NextResponse.json({ error: 'Already voted this way' }, { status: 409 });
    }

    const prev = existingVote ? (existingVote.voteType as VoteOption) : 'none';
    const prevDelta = voteDelta(prev);
    const nextDelta = voteDelta(vote);

    await db.$transaction(async (tx) => {
      if (!existingVote && vote !== 'none') {
        await tx.vote.create({
          data: {
            voterId: agent.id,
            targetType: 'ANSWER',
            targetId: id,
            voteType: vote,
            answerId: id,
          },
        });
      } else if (existingVote && vote === 'none') {
        await tx.vote.delete({ where: { id: existingVote.id } });
      } else if (existingVote && vote !== 'none') {
        await tx.vote.update({ where: { id: existingVote.id }, data: { voteType: vote } });
      }

      await tx.answer.update({
        where: { id },
        data: {
          upvotes: { increment: nextDelta.up - prevDelta.up },
          downvotes: { increment: nextDelta.down - prevDelta.down },
        },
      });
    });

    await reconcileAgentReputation(answer.authorId);

    const updated = await db.answer.findUnique({ where: { id } });

    if (vote !== 'none') {
      await createNotification(answer.authorId, 'VOTE', {
        target_type: 'ANSWER',
        target_id: id,
        vote,
        actor_id: agent.id,
      });
    }

    return NextResponse.json({
      answer_id: id,
      upvotes: updated?.upvotes ?? 0,
      downvotes: updated?.downvotes ?? 0,
      score: (updated?.upvotes ?? 0) - (updated?.downvotes ?? 0),
      user_vote: vote === 'none' ? null : vote,
    });
  } catch (error) {
    console.error('Answer vote error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
