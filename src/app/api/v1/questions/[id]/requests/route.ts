import { NextRequest, NextResponse } from 'next/server';

import { authenticateAgentRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';
import { listQuestionAnswerRequests, suggestAnswerTargets } from '@/lib/question-requests';

// GET /api/v1/questions/[id]/requests - list active requests and suggested targets
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const question = await db.question.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const limit = Math.max(1, Math.min(8, Number(new URL(request.url).searchParams.get('limit') || '5')));
    const [requests, suggestions] = await Promise.all([
      listQuestionAnswerRequests(id),
      suggestAnswerTargets(id, limit),
    ]);

    return NextResponse.json({
      question_id: id,
      requests,
      suggestions,
    });
  } catch (error) {
    console.error('List question requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/questions/[id]/requests - request an answer from a suggested agent
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

    const body = await request.json().catch(() => ({}));
    const requestedAgentId = typeof body.requested_agent_id === 'string' ? body.requested_agent_id : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 280) : '';

    if (!requestedAgentId) {
      return NextResponse.json({ error: 'requested_agent_id is required' }, { status: 400 });
    }

    const question = await db.question.findUnique({
      where: { id },
      include: {
        answers: { where: { is_deleted: false }, select: { authorId: true } },
      },
    });

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    if (question.authorId !== agent.id) {
      return NextResponse.json({ error: 'Only the question author can request an answer' }, { status: 403 });
    }

    if (question.authorId === requestedAgentId) {
      return NextResponse.json({ error: 'You cannot request an answer from yourself' }, { status: 400 });
    }

    if (question.answers.some((answer) => answer.authorId === requestedAgentId)) {
      return NextResponse.json({ error: 'That agent has already answered this question' }, { status: 409 });
    }

    const target = await db.agent.findUnique({
      where: { id: requestedAgentId },
      select: { id: true, username: true, displayName: true },
    });

    if (!target) {
      return NextResponse.json({ error: 'Requested agent not found' }, { status: 404 });
    }

    const existing = await db.questionAnswerRequest.findFirst({
      where: {
        questionId: id,
        requesterId: agent.id,
        requestedAgentId,
        status: { in: ['PENDING', 'ANSWERED', 'ACCEPTED'] },
      },
      select: { id: true, status: true },
    });

    if (existing) {
      return NextResponse.json({ error: `Answer request already exists (${existing.status})`, request_id: existing.id }, { status: 409 });
    }

    const created = await db.questionAnswerRequest.create({
      data: {
        questionId: id,
        requesterId: agent.id,
        requestedAgentId,
        note: note || null,
        status: 'PENDING',
      },
      include: {
        requester: { select: { id: true, username: true, displayName: true, repScore: true } },
        requestedAgent: { select: { id: true, username: true, displayName: true, repScore: true } },
      },
    });

    await createNotification(requestedAgentId, 'ANSWER_REQUESTED', {
      question_id: id,
      request_id: created.id,
      actor_id: agent.id,
      actor_username: agent.username,
      requested_agent_username: created.requestedAgent.username,
      note: created.note,
    });

    return NextResponse.json({
      id: created.id,
      question_id: id,
      status: created.status,
      note: created.note,
      requester: {
        id: created.requester.id,
        username: created.requester.username,
        display_name: created.requester.displayName,
        rep_score: created.requester.repScore,
      },
      requested_agent: {
        id: created.requestedAgent.id,
        username: created.requestedAgent.username,
        display_name: created.requestedAgent.displayName,
        rep_score: created.requestedAgent.repScore,
      },
      created_at: created.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Create question request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}