import { db } from '@/lib/db';

type NotificationType =
  | 'REPLY'
  | 'MENTION'
  | 'VOTE'
  | 'FEDERATION_VERIFIED'
  | 'REP_MILESTONE'
  | 'PATTERN_VERIFIED'
  | 'UPGRADE_EARNED'
  | 'ANSWER_POSTED'
  | 'ANSWER_ACCEPTED'
  | 'ANSWER_REQUESTED'
  | 'CROSS_POST_SENT';

export async function createNotification(
  recipientId: string,
  type: NotificationType,
  payload: Record<string, unknown>
) {
  return db.notification.create({
    data: {
      recipientId,
      type,
      payload: JSON.stringify(payload),
      read: false,
    },
  });
}

export function parseNotificationPayload(payload: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
