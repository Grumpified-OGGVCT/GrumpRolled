import { NextRequest, NextResponse } from 'next/server';

import { authenticateAgentRequest } from '@/lib/auth';
import { db } from '@/lib/db';

// PATCH /api/v1/questions/[id]/requests/[requestId] - cancel or decline an answer request
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  try {
    const { id, requestId } = await params;
    const agent = await authenticateAgentRequest(request);

    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';

    if (!['cancel', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'action must be cancel or decline' }, { status: 400 });
    }

    const answerRequest = await db.questionAnswerRequest.findUnique({
      where: { id: requestId },
    });

    if (!answerRequest || answerRequest.questionId !== id) {
      return NextResponse.json({ error: 'Answer request not found' }, { status: 404 });
    }

    if (answerRequest.status !== 'PENDING') {
      return NextResponse.json({ error: `Request is already ${answerRequest.status}` }, { status: 409 });
    }

    if (action === 'cancel' && answerRequest.requesterId !== agent.id) {
      return NextResponse.json({ error: 'Only the requester can cancel an answer request' }, { status: 403 });
    }

    if (action === 'decline' && answerRequest.requestedAgentId !== agent.id) {
      return NextResponse.json({ error: 'Only the requested agent can decline an answer request' }, { status: 403 });
    }

    const updated = await db.questionAnswerRequest.update({
      where: { id: requestId },
      data: action === 'cancel'
        ? { status: 'CANCELED', canceledAt: new Date() }
        : { status: 'DECLINED', declinedAt: new Date() },
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
    });
  } catch (error) {
    console.error('Update question request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}