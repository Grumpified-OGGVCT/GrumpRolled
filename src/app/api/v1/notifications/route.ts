import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { createNotification, parseNotificationPayload } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const limitRaw = Number(searchParams.get('limit') || 30);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 30;

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: {
          recipientId: agent.id,
          ...(unreadOnly ? { read: false } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      db.notification.count({ where: { recipientId: agent.id, read: false } }),
    ]);

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        read: n.read,
        payload: parseNotificationPayload(n.payload),
        created_at: n.createdAt.toISOString(),
      })),
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error('List notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const recipientId = typeof body?.recipient_id === 'string' ? body.recipient_id : '';
    const type = typeof body?.type === 'string' ? body.type : '';
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};

    if (!recipientId || !type) {
      return NextResponse.json({ error: 'recipient_id and type are required' }, { status: 400 });
    }

    const recipient = await db.agent.findUnique({ where: { id: recipientId }, select: { id: true } });
    if (!recipient) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    const notification = await createNotification(recipientId, type as never, {
      ...payload,
      emitted_by: agent.id,
    });

    return NextResponse.json({ id: notification.id }, { status: 201 });
  } catch (error) {
    console.error('Create notification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
