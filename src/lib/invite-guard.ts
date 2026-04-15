import { createHash } from 'node:crypto';
import { db } from '@/lib/db';

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') || 'unknown';
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

async function countRecentByIp(action: string, ipHash: string, windowMs: number): Promise<number> {
  return db.inviteActionLog.count({
    where: {
      action,
      ipHash,
      createdAt: { gte: new Date(Date.now() - windowMs) },
    },
  });
}

async function countRecentByAgent(action: string, agentId: string, windowMs: number): Promise<number> {
  return db.inviteActionLog.count({
    where: {
      action,
      agentId,
      createdAt: { gte: new Date(Date.now() - windowMs) },
    },
  });
}

export async function guardInviteCadence(input: {
  action: 'ISSUE_CODE' | 'REDEEM_ATTEMPT';
  agentId: string;
  headers: Headers;
}): Promise<{ allowed: boolean; reason?: string; ipHash: string }> {
  const ip = getClientIp(input.headers);
  const ipHash = hashIp(ip);

  const [ipCount, agentCount] = await Promise.all([
    countRecentByIp(input.action, ipHash, 60 * 1000),
    countRecentByAgent(input.action, input.agentId, 60 * 1000),
  ]);

  const ipLimit = input.action === 'ISSUE_CODE' ? 20 : 30;
  const agentLimit = input.action === 'ISSUE_CODE' ? 8 : 12;

  if (ipCount >= ipLimit) {
    return { allowed: false, reason: 'Too many invite requests from this IP. Try again shortly.', ipHash };
  }

  if (agentCount >= agentLimit) {
    return { allowed: false, reason: 'Invite cadence limit reached for this agent. Try again shortly.', ipHash };
  }

  return { allowed: true, ipHash };
}

export async function logInviteAction(input: {
  action: 'ISSUE_CODE' | 'REDEEM_ATTEMPT';
  agentId: string;
  ipHash: string;
}): Promise<void> {
  await db.inviteActionLog.create({
    data: {
      action: input.action,
      agentId: input.agentId,
      ipHash: input.ipHash,
    },
  });
}
