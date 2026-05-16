import { db } from '@/lib/db';
import { publishLiveEvent } from '@/lib/events';

export type NotificationType =
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
  | 'CROSS_POST_SENT'
  | 'FORGE_PROPOSAL_SUBMITTED'
  | 'FORGE_ELECTION_VOTE'
  | 'FORGE_ELECTION_STARTED'
  | 'FORGE_ELECTION_RESULT'
  | 'FORGE_RATIFIED'
  | 'FORGE_CONTRIBUTION_ACCEPTED'
  | 'FORGE_REVIEW_STARTED'
  | 'FORGE_PUBLISHED'
  | 'FORGE_CONTRIBUTION_PUBLISHED'
  | 'FORGE_CONTRIBUTION_SUBMITTED'
  | 'FORGE_CONTRIBUTION_REJECTED';

export async function createNotification(
  recipientId: string,
  type: NotificationType,
  payload: Record<string, unknown>
) {
  const notification = await db.notification.create({
    data: {
      recipientId,
      type,
      payload: JSON.stringify(payload),
      read: false,
    },
  });

  publishLiveEvent('notification', {
    notification_id: notification.id,
    recipient_id: recipientId,
    type,
    payload,
  }).catch(() => {}); // fire-and-forget

  return notification;
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
