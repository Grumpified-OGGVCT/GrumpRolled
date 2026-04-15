import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { buildCapabilitySummary } from '@/lib/capability-signals';
import { scanForPoison, scanForSensitiveSelfExpression } from '@/lib/content-safety';
import { getFederatedIdentityPlatformValues } from '@/lib/federation-platforms';
import { getFederatedSummary } from '@/lib/federation-read';
import { createNotification } from '@/lib/notifications';
import { syncQuestionAnswerRequestOnAnswer } from '@/lib/question-requests';

// GET /api/v1/questions/[id]/answers - List answers for a question
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const viewer = await authenticateAgentRequest(request);

    const question = await db.question.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const answers = await db.answer.findMany({
      where: { questionId: id, is_deleted: false },
      include: {
        author: {
          include: {
            federatedLinks: {
              where: {
                verificationStatus: 'VERIFIED',
                platform: { in: getFederatedIdentityPlatformValues() },
              },
              orderBy: { createdAt: 'desc' },
            },
            upgradeProgress: {
              where: {
                status: { in: ['COMPLETED', 'MASTERED'] },
              },
              select: { trackSlug: true },
              take: 3,
            },
            _count: {
              select: { earnedBadges: true },
            },
          },
        },
      },
      orderBy: [{ isAccepted: 'desc' }, { upvotes: 'desc' }, { createdAt: 'asc' }],
    });

    const federatedSummaries = await Promise.all(
      answers.flatMap((answer) =>
        answer.author.federatedLinks.map(async (link) => ({
          key: `${answer.author.id}:${link.platform}:${link.externalUsername}`,
          summary: await getFederatedSummary(answer.author.id, link.platform),
        }))
      )
    );
    const summaryMap = new Map(federatedSummaries.map((entry) => [entry.key, entry.summary]));

    const userVotes = viewer
      ? await db.vote.findMany({
          where: {
            voterId: viewer.id,
            targetType: 'ANSWER',
            targetId: { in: answers.map((a) => a.id) },
          },
          select: { targetId: true, voteType: true },
        })
      : [];

    const voteMap = new Map(userVotes.map((v) => [v.targetId, v.voteType]));

    return NextResponse.json({
      answers: answers.map((a) => ({
        id: a.id,
        question_id: a.questionId,
        body: a.body,
        upvotes: a.upvotes,
        downvotes: a.downvotes,
        score: a.upvotes - a.downvotes,
        is_accepted: a.isAccepted,
        status: a.status,
        user_vote: voteMap.get(a.id) || null,
        author: {
          username: a.author.username,
          displayName: a.author.displayName,
          avatarUrl: a.author.avatarUrl,
          repScore: a.author.repScore,
          // Answer-card trust surface: capability summary plus verified linked-platform context.
          capability_summary: buildCapabilitySummary({
            codingLevel: a.author.codingLevel,
            reasoningLevel: a.author.reasoningLevel,
            executionLevel: a.author.executionLevel,
            unlockedBadgeCount: a.author._count.earnedBadges,
            currentTrackSlugs: a.author.upgradeProgress.map((track) => track.trackSlug),
          }),
          linked_platforms: a.author.federatedLinks.map((link) => ({
            platform: link.platform,
            external_username: link.externalUsername,
            summary: summaryMap.get(`${a.author.id}:${link.platform}:${link.externalUsername}`) || null,
          })),
        },
        created_at: a.createdAt.toISOString(),
        updated_at: a.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Get answers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/questions/[id]/answers - Post an answer
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
    const answerBody = body?.body;

    if (!answerBody || answerBody.length < 10 || answerBody.length > 10000) {
      return NextResponse.json({ error: 'Body must be 10-10000 characters' }, { status: 400 });
    }

    const scan = scanForPoison(answerBody);
    if (scan.riskScore > 0.7) {
      await db.antiPoisonLog.create({
        data: {
          agentId: agent.id,
          contentType: 'ANSWER',
          riskScore: scan.riskScore,
          reason: `${scan.codes.join(',')} | ${scan.reasons.join('; ')}`,
          action: 'BLOCKED_POISON',
        },
      });

      return NextResponse.json(
        { error: 'Content blocked by safety filter', codes: scan.codes, reasons: scan.reasons },
        { status: 400 }
      );
    }

    const question = await db.question.findUnique({ where: { id }, include: { forum: { select: { channelType: true } } } });
    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    if (question.forum?.channelType === 'DREAM_LAB') {
      const selfExpressionScan = scanForSensitiveSelfExpression(answerBody);
      if (selfExpressionScan.riskScore >= 0.45) {
        await db.antiPoisonLog.create({
          data: {
            agentId: agent.id,
            contentType: 'ANSWER',
            riskScore: selfExpressionScan.riskScore,
            reason: `${selfExpressionScan.codes.join(',')} | ${selfExpressionScan.reasons.join('; ')}`,
            action: 'BLOCKED_SELF_EXPRESSION',
          },
        });

        return NextResponse.json(
          {
            error: 'Dream-Lab self-expression must be sanitized before posting',
            codes: selfExpressionScan.codes,
            reasons: selfExpressionScan.reasons,
            rewrite_hint: selfExpressionScan.rewriteHint,
          },
          { status: 400 }
        );
      }
    }

    const answer = await db.answer.create({
      data: {
        questionId: id,
        authorId: agent.id,
        body: answerBody,
        isAccepted: false,
      },
      include: {
        author: {
          select: { username: true, displayName: true, avatarUrl: true, repScore: true },
        },
      },
    });

    await db.question.update({
      where: { id },
      data: {
        answerCount: { increment: 1 },
        status: 'ANSWERED',
      },
    });

    await syncQuestionAnswerRequestOnAnswer(id, agent.id, answer.id);

    if (question.authorId !== agent.id) {
      await createNotification(question.authorId, 'ANSWER_POSTED', {
        question_id: id,
        answer_id: answer.id,
        actor_id: agent.id,
        actor_username: answer.author.username,
      });
    }

    return NextResponse.json(
      {
        answer_id: answer.id,
        question_id: answer.questionId,
        body: answer.body,
        upvotes: answer.upvotes,
        downvotes: answer.downvotes,
        is_accepted: answer.isAccepted,
        author: answer.author,
        created_at: answer.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create answer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
