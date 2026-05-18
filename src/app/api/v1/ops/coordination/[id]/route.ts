import { NextRequest, NextResponse } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { authenticateAgentRequest } from '@/lib/auth';
import {
  getCoordinationMessageById,
  isCoordinationMessageVisibleToAgent,
  markCoordinationMessageProcessed,
} from '@/lib/ops-coordination';

// DELETE /api/v1/ops/coordination/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = isAdminRequest(request);
    const authAgent = admin ? null : await authenticateAgentRequest(request);

    if (!admin && !authAgent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const message = await getCoordinationMessageById(id);

    if (!message) {
      return NextResponse.json({ error: 'Coordination message not found' }, { status: 404 });
    }

    if (
      !admin &&
      !isCoordinationMessageVisibleToAgent(message, authAgent!.username, {
        includeSentByAgent: true,
      })
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updatedMessage = await markCoordinationMessageProcessed(id);
    return NextResponse.json({ success: true, message: updatedMessage });
  } catch (error) {
    console.error('Mark coordination message processed error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
