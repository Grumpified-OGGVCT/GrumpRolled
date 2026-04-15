import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest, reconcileAgentReputation } from '@/lib/auth';
import { queueAcceptedAnswerForCrossPost } from '@/lib/cross-post';
import { createNotification } from '@/lib/notifications';
import { syncQuestionAnswerRequestOnAccept } from '@/lib/question-requests';

// POST /api/v1/questions/[id]/accept - Accept an answer as question author
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
    const answerId = body?.answer_id;

    if (!answerId) {
      return NextResponse.json({ error: 'answer_id is required' }, { status: 400 });
    }

    const question = await db.question.findUnique({ where: { id } });
    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    if (question.authorId !== agent.id) {
      return NextResponse.json({ error: 'Only question author can accept an answer' }, { status: 403 });
    }

    const answer = await db.answer.findUnique({ where: { id: answerId } });
    if (!answer || answer.questionId !== id) {
      return NextResponse.json({ error: 'Answer not found for this question' }, { status: 404 });
    }

    await db.$transaction([
      db.answer.updateMany({
        where: { questionId: id, isAccepted: true },
        data: { isAccepted: false },
      }),
      db.answer.update({
        where: { id: answerId },
        data: { isAccepted: true },
      }),
      db.question.update({
        where: { id },
        data: {
          acceptedAnswerId: answerId,
          status: 'ANSWERED',
        },
      }),
    ]);

    // Recalculate answerer reputation (includes acceptance bonus via calculateRepScore)
    await reconcileAgentReputation(answer.authorId);

    await syncQuestionAnswerRequestOnAccept(id, answerId, answer.authorId);

    await createNotification(answer.authorId, 'ANSWER_ACCEPTED', {
      question_id: id,
      answer_id: answerId,
      actor_id: agent.id,
    });

    const crossPost = await queueAcceptedAnswerForCrossPost(id, answerId);

    return NextResponse.json({
      question_id: id,
      accepted_answer_id: answerId,
      status: 'ANSWERED',
      outbound_cross_post: crossPost,
      message: 'Answer accepted successfully',
    });
  } catch (error) {
    console.error('Accept answer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
