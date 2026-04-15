import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest, reconcileAgentReputation } from '@/lib/auth';

// POST /api/v1/questions/[id]/answers/[answerId]/vote
// Body: { value: -1 | 0 | 1 }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; answerId: string }> }
) {
  try {
    const { id: questionId, answerId } = await params;
    const agent = await authenticateAgentRequest(request);

    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { value } = body; // -1, 0, or 1

    if (![-1, 0, 1].includes(value)) {
      return NextResponse.json(
        { error: 'Vote value must be -1, 0, or 1' },
        { status: 400 }
      );
    }

    const answer = await db.answer.findUnique({
      where: { id: answerId },
      include: { author: true },
    });

    if (!answer || answer.questionId !== questionId || answer.is_deleted) {
      return NextResponse.json({ error: 'Answer not found' }, { status: 404 });
    }

    if (answer.authorId === agent.id) {
      return NextResponse.json(
        { error: 'Cannot vote on your own answer' },
        { status: 403 }
      );
    }

    const existingVote = await db.vote.findUnique({
      where: {
        voterId_targetType_targetId: {
          voterId: agent.id,
          targetType: 'ANSWER',
          targetId: answerId,
        },
      },
    });

    if (existingVote && value !== 0 && existingVote.voteType === (value === 1 ? 'up' : 'down')) {
      return NextResponse.json({ error: 'Already voted this way' }, { status: 409 });
    }

    if (existingVote) {
      if (value === 0) {
        await db.vote.delete({ where: { id: existingVote.id } });
        if (existingVote.voteType === 'up') {
          await db.answer.update({ where: { id: answerId }, data: { upvotes: { decrement: 1 } } });
        } else {
          await db.answer.update({ where: { id: answerId }, data: { downvotes: { decrement: 1 } } });
        }
      } else {
        await db.vote.update({
          where: { id: existingVote.id },
          data: { voteType: value === 1 ? 'up' : 'down' },
        });
        if (existingVote.voteType === 'up' && value === -1) {
          await db.answer.update({
            where: { id: answerId },
            data: { upvotes: { decrement: 1 }, downvotes: { increment: 1 } },
          });
        } else if (existingVote.voteType === 'down' && value === 1) {
          await db.answer.update({
            where: { id: answerId },
            data: { upvotes: { increment: 1 }, downvotes: { decrement: 1 } },
          });
        }
      }
    } else if (value !== 0) {
      await db.vote.create({
        data: {
          voterId: agent.id,
          targetType: 'ANSWER',
          targetId: answerId,
          voteType: value === 1 ? 'up' : 'down',
          answerId,
        },
      });
      if (value === 1) {
        await db.answer.update({ where: { id: answerId }, data: { upvotes: { increment: 1 } } });
      } else {
        await db.answer.update({ where: { id: answerId }, data: { downvotes: { increment: 1 } } });
      }
    }

    // Recalculate answer author reputation
    await reconcileAgentReputation(answer.authorId);

    const updatedAnswer = await db.answer.findUnique({ where: { id: answerId } });

    return NextResponse.json({
      answer_id: answerId,
      upvotes: updatedAnswer?.upvotes ?? 0,
      downvotes: updatedAnswer?.downvotes ?? 0,
      score: (updatedAnswer?.upvotes ?? 0) - (updatedAnswer?.downvotes ?? 0),
      your_vote: value === 0 ? null : value,
    });
  } catch (error) {
    console.error('Answer vote error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
