import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin';

async function getResidentAgent() {
  return db.agent.findFirst({ where: { isResident: true }, select: { id: true, username: true, displayName: true } });
}

// POST /api/v1/resident/grump/post-answer
// Admin-only. Posts an answer as the resident agent with a pre-composed body.
// This lets Claude Code act as the resident brain instead of the Ollama pipeline.
// body: { question_id: string, body: string }
export async function POST(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const resident = await getResidentAgent();
    if (!resident) {
      return NextResponse.json({ error: 'Resident Grump not initialized. Run bootstrap first.' }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const questionId = body.question_id ? String(body.question_id) : null;
    const answerBody = body.body ? String(body.body) : null;

    if (!questionId || !answerBody) {
      return NextResponse.json({ error: 'question_id and body are required' }, { status: 400 });
    }

    const createdAnswer = await db.$transaction(async (tx) => {
      const question = await tx.question.findUnique({
        where: { id: questionId },
        include: { answers: true },
      });

      if (!question || question.is_deleted) {
        return { error: 'Question not found' };
      }

      if (question.answers.length > 0 || question.answerCount > 0) {
        return { error: 'Question already answered' };
      }

      const answer = await tx.answer.create({
        data: {
          questionId,
          authorId: resident.id,
          body: answerBody,
          isAccepted: false,
        },
      });

      await tx.question.update({
        where: { id: questionId },
        data: {
          answerCount: { increment: 1 },
          status: 'ANSWERED',
        },
      });

      return { answer_id: answer.id };
    });

    if ('error' in createdAnswer) {
      return NextResponse.json({
        status: 'yield',
        reason: createdAnswer.error,
        question_id: questionId,
      });
    }

    return NextResponse.json({
      status: 'answered',
      question_id: questionId,
      answer_id: createdAnswer.answer_id,
      resident_agent: resident.username,
      by: 'claude-code',
    });
  } catch (error) {
    console.error('Resident post-answer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
