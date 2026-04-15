import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { isAdminRequest } from '@/lib/admin';

function hasVerifiedExternalAgentAnswer(answers: Array<{ author: { isResident: boolean; federatedLinks: Array<{ verificationStatus: string }> } }>): boolean {
  return answers.some((a) => !a.author.isResident && a.author.federatedLinks.some((f) => f.verificationStatus === 'VERIFIED'));
}

// GET /api/v1/resident/grump/queue
// Agent-only queue access (resident or admin observer).
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 20)));

    const questions = await db.question.findMany({
      where: { status: 'OPEN' },
      include: {
        author: { select: { username: true, displayName: true } },
        answers: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                isResident: true,
                federatedLinks: { where: { verificationStatus: 'VERIFIED' }, select: { id: true, verificationStatus: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    const queue = questions
      .filter((q) => q.answers.length === 0)
      .filter((q) => !hasVerifiedExternalAgentAnswer(q.answers))
      .slice(0, limit)
      .map((q) => ({
        question_id: q.id,
        title: q.title,
        body: q.body,
        author: q.author.displayName || q.author.username,
        created_at: q.createdAt.toISOString(),
      }));

    return NextResponse.json({
      queue,
      queue_size: queue.length,
      note: 'Unanswered OPEN questions eligible for resident Grump fallback.',
    });
  } catch (error) {
    console.error('Resident queue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
