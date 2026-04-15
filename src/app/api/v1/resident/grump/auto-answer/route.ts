import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { isAdminRequest } from '@/lib/admin';
import { answerWithTriplePass } from '@/lib/ollama-cloud';

function hasVerifiedExternalAgentAnswer(answers: Array<{ author: { isResident: boolean; federatedLinks: Array<{ verificationStatus: string }> } }>): boolean {
  return answers.some((a) => !a.author.isResident && a.author.federatedLinks.some((f) => f.verificationStatus === 'VERIFIED'));
}

async function getResidentAgent() {
  return db.agent.findFirst({ where: { isResident: true }, select: { id: true, username: true, displayName: true } });
}

// POST /api/v1/resident/grump/auto-answer
// body: { question_id?: string, dry_run?: boolean }
export async function POST(request: NextRequest) {
  try {
    const authAgent = await authenticateAgentRequest(request);
    const admin = isAdminRequest(request);

    if (!authAgent && !admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let isResidentCaller = false;
    if (authAgent) {
      const caller = await db.agent.findUnique({ where: { id: authAgent.id }, select: { isResident: true } });
      isResidentCaller = Boolean(caller?.isResident);
    }

    if (!admin && !isResidentCaller) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const resident = await getResidentAgent();
    if (!resident) {
      return NextResponse.json({ error: 'Resident Grump not initialized. Run bootstrap first.' }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const dryRun = Boolean(body.dry_run);
    const explicitQuestionId = body.question_id ? String(body.question_id) : null;

    const question = explicitQuestionId
      ? await db.question.findUnique({
          where: { id: explicitQuestionId },
          include: {
            answers: {
              include: {
                author: {
                  select: {
                    id: true,
                    isResident: true,
                    federatedLinks: { where: { verificationStatus: 'VERIFIED' }, select: { id: true, verificationStatus: true } },
                  },
                },
              },
            },
          },
        })
      : await db.question.findFirst({
          where: { status: 'OPEN' },
          include: {
            answers: {
              include: {
                author: {
                  select: {
                    id: true,
                    isResident: true,
                    federatedLinks: { where: { verificationStatus: 'VERIFIED' }, select: { id: true, verificationStatus: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        });

    if (!question) {
      return NextResponse.json({ status: 'idle', reason: 'no_open_question_found' });
    }

    if (question.answers.length > 0) {
      return NextResponse.json({
        status: 'yield',
        reason: 'already_answered_by_agent',
        question_id: question.id,
      });
    }

    if (hasVerifiedExternalAgentAnswer(question.answers)) {
      return NextResponse.json({
        status: 'yield',
        reason: 'verified_external_agent_answer_exists',
        question_id: question.id,
      });
    }

    const prompt = `Question: ${question.title}\n\n${question.body}`;
    const llm = await answerWithTriplePass(prompt);

    if (dryRun) {
      return NextResponse.json({
        status: 'dry_run',
        question_id: question.id,
        resident_agent: resident.username,
        preview: llm.answer,
        quality: {
          confidence: llm.confidence,
          model_primary: llm.modelPrimary,
          model_verifier: llm.modelVerifier,
          selection_summary: llm.selectionSummary,
          transparency: {
            primary: llm.primaryTransparency,
            verifier: llm.verifierTransparency,
          },
        },
      });
    }

    const createdAnswer = await db.$transaction(async (tx) => {
      const current = await tx.question.findUnique({ where: { id: question.id }, include: { answers: true } });
      if (!current) return null;
      if (current.answers.length > 0) return null;

      const answer = await tx.answer.create({
        data: {
          questionId: question.id,
          authorId: resident.id,
          body: llm.answer,
          isAccepted: false,
        },
      });

      await tx.question.update({
        where: { id: question.id },
        data: {
          answerCount: { increment: 1 },
          status: 'ANSWERED',
        },
      });

      return answer;
    });

    if (!createdAnswer) {
      return NextResponse.json({
        status: 'yield',
        reason: 'race_or_answered_during_processing',
        question_id: question.id,
      });
    }

    return NextResponse.json({
      status: 'answered',
      question_id: question.id,
      answer_id: createdAnswer.id,
      resident_agent: resident.username,
      quality: {
        confidence: llm.confidence,
        model_primary: llm.modelPrimary,
        model_verifier: llm.modelVerifier,
        selection_summary: llm.selectionSummary,
        transparency: {
          primary: llm.primaryTransparency,
          verifier: llm.verifierTransparency,
        },
      },
    });
  } catch (error) {
    console.error('Resident auto-answer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
