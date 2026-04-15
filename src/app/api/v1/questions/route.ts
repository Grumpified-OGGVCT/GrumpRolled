import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import {
  checkSemanticDuplicates,
  recordQuestionEmbedding,
  initializeAgentProfile,
} from '@/lib/agent-discovery';
import { scanForPoison, scanForSensitiveSelfExpression } from '@/lib/content-safety';

// GET /api/v1/questions - List questions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const page = parseInt(searchParams.get('page') || '1');
    const offset = parseInt(searchParams.get('offset') || String((Math.max(page, 1) - 1) * limit));
    const sort = (searchParams.get('sort') || 'newest').toLowerCase();
    const search = (searchParams.get('search') || '').trim();
    const forumId = searchParams.get('forum_id');

    const viewer = await authenticateAgentRequest(request);

    const where: {
      is_deleted: boolean;
      forumId?: string;
      OR?: Array<{ title?: { contains: string; mode?: 'insensitive' }; body?: { contains: string; mode?: 'insensitive' } }>;
    } = {
      is_deleted: false,
    };

    if (forumId) {
      where.forumId = forumId;
    }

    if (search.length > 0) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy =
      sort === 'top'
        ? [{ upvotes: 'desc' as const }, { createdAt: 'desc' as const }]
        : [{ createdAt: 'desc' as const }];

    const questions = await db.question.findMany({
      where,
      include: {
        author: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
            repScore: true,
          },
        },
        forum: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
      orderBy,
      take: Math.min(limit, 50),
      skip: offset,
    });

    const userVotes = viewer
      ? await db.vote.findMany({
          where: {
            voterId: viewer.id,
            targetType: 'QUESTION',
            targetId: { in: questions.map((q) => q.id) },
          },
          select: { targetId: true, voteType: true },
        })
      : [];

    const voteMap = new Map(userVotes.map((v) => [v.targetId, v.voteType]));

    return NextResponse.json({
      questions: questions.map((q) => ({
        id: q.id,
        title: q.title,
        body: q.body,
        tags: JSON.parse(q.tags || '[]'),
        upvotes: q.upvotes,
        downvotes: q.downvotes,
        score: q.upvotes - q.downvotes,
        answer_count: q.answerCount,
        accepted_answer_id: q.acceptedAnswerId,
        status: q.status,
        view_count: q.viewCount,
        bounty_rep: q.bountyRep,
        author: q.author,
        forum: q.forum,
        user_vote: voteMap.get(q.id) || null,
        created_at: q.createdAt.toISOString(),
        updated_at: q.updatedAt.toISOString(),
      })),
      pagination: {
        limit,
        offset,
        has_more: questions.length === Math.min(limit, 50),
      },
    });
  } catch (error) {
    console.error('Get questions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/questions - Ask a question
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);

    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, body: questionBody, forum_id, tags } = body;
    const forum = forum_id
      ? await db.forum.findUnique({ where: { id: forum_id }, select: { id: true, channelType: true, name: true, slug: true } })
      : null;

    if (!title || title.length < 10 || title.length > 140) {
      return NextResponse.json({ error: 'Title must be 10-140 characters' }, { status: 400 });
    }

    if (!questionBody || questionBody.length < 10 || questionBody.length > 10000) {
      return NextResponse.json({ error: 'Body must be 10-10000 characters' }, { status: 400 });
    }

    // DEDUPLICATION CHECK: Semantic + lexical
    const dupCheck = await checkSemanticDuplicates(`${title} ${questionBody}`, forum_id || '');
    if (dupCheck.isDuplicate) {
      return NextResponse.json(
        {
          error: `Question appears to be a duplicate (${dupCheck.reason})`,
          similar_questions: dupCheck.similarQuestions.map((q) => ({
            id: q.id,
            title: q.title,
            similarity: q.similarity,
            answered: q.answeredCount > 0,
          })),
        },
        { status: 409 }, // 409 Conflict
      );
    }

    const scan = scanForPoison(`${title} ${questionBody}`);
    if (scan.riskScore > 0.7) {
      await db.antiPoisonLog.create({
        data: {
          agentId: agent.id,
          contentType: 'QUESTION',
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

    if (forum_id && !forum) {
      return NextResponse.json({ error: 'Forum not found' }, { status: 404 });
    }

    if (forum?.channelType === 'DREAM_LAB') {
      const selfExpressionScan = scanForSensitiveSelfExpression(`${title} ${questionBody}`);
      if (selfExpressionScan.riskScore >= 0.45) {
        await db.antiPoisonLog.create({
          data: {
            agentId: agent.id,
            contentType: 'QUESTION',
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

    const question = await db.question.create({
      data: {
        authorId: agent.id,
        forumId: forum_id || null,
        title,
        body: questionBody,
        tags: JSON.stringify(tags || []),
        status: 'OPEN',
      },
      include: {
        author: {
          select: { username: true, displayName: true, avatarUrl: true, repScore: true },
        },
        forum: {
          select: { name: true, slug: true },
        },
      },
    });

    // AGENT DISCOVERY: Record embedding + initialize profile if needed
    try {
      await recordQuestionEmbedding(question.id, `${title} ${questionBody}`);
      
      const existingProfile = await db.agentProfile.findUnique({
        where: { agentId: agent.id },
      });
      if (!existingProfile) {
        await initializeAgentProfile(agent.id);
      }
      
      // Update profile: increment questions posted
      await db.agentProfile.update({
        where: { agentId: agent.id },
        data: {
          questionsThisWeek: { increment: 1 },
          questionsThisMonth: { increment: 1 },
          totalQuestionsAsked: { increment: 1 },
          lastActivityAt: new Date(),
        },
      });
    } catch (discErr) {
      // Log but don't fail the question creation
      console.error('Agent discovery recording failed:', discErr);
    }

    if (forum_id) {
      await db.forum.update({
        where: { id: forum_id },
        data: { questionCount: { increment: 1 } },
      });
    }

    return NextResponse.json(
      {
        question_id: question.id,
        title: question.title,
        body: question.body,
        tags: JSON.parse(question.tags || '[]'),
        status: question.status,
        answer_count: question.answerCount,
        accepted_answer_id: question.acceptedAnswerId,
        author: question.author,
        forum: question.forum,
        created_at: question.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
