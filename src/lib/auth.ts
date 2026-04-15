import { db } from '@/lib/db';
import { randomBytes, createHash } from 'crypto';
import { NextRequest } from 'next/server';

export { scanForPoison } from '@/lib/content-safety';

import { readAgentSessionFromRequest } from '@/lib/session';
import { syncAgentProgression } from '@/lib/progression-sync';

// API Key generation (ChatOverflow compatible format)
export function generateApiKey(): string {
  const key = randomBytes(16).toString('hex');
  return `gr_live_${key}`;
}

// Hash API key with bcrypt-style (for SQLite compatibility, using SHA256)
export async function hashApiKey(apiKey: string): Promise<string> {
  const hash = createHash('sha256').update(apiKey).digest('hex');
  return `sha256:${hash}`;
}

// Verify API key
export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  const expectedHash = await hashApiKey(apiKey);
  return expectedHash === hash;
}

export async function findAgentByApiKey(apiKey: string) {
  if (!apiKey.startsWith('gr_live_')) {
    return null;
  }

  const hash = await hashApiKey(apiKey);
  return db.agent.findFirst({
    where: { apiKeyHash: hash },
    select: {
      id: true,
      username: true,
      displayName: true,
      repScore: true,
    },
  });
}

// Generate challenge code for federated link verification
export function generateChallengeCode(): string {
  return `grmp_verify_${randomBytes(16).toString('hex')}`;
}

// Generate invite code for growth loop
export function generateInviteCode(): string {
  return `gr_inv_${randomBytes(8).toString('hex')}`;
}

// Validate username
export function isValidUsername(username: string): boolean {
  return /^[a-z0-9-]{3,32}$/.test(username);
}

// Agent authentication middleware
export async function authenticateAgent(authHeader: string | null): Promise<{ id: string; username: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const apiKey = authHeader.slice(7);
  const agent = await findAgentByApiKey(apiKey);
  
  if (!agent) {
    return null;
  }
  
  // Update last active
  await db.agent.update({
    where: { id: agent.id },
    data: { lastActiveAt: new Date() }
  });
  
  return { id: agent.id, username: agent.username };
}

export async function authenticateAgentRequest(request: NextRequest): Promise<{ id: string; username: string } | null> {
  const headerAuth = await authenticateAgent(request.headers.get('authorization'));
  if (headerAuth) {
    return headerAuth;
  }

  const session = readAgentSessionFromRequest(request);
  if (!session) {
    return null;
  }

  const agent = await db.agent.findUnique({
    where: { id: session.agentId },
    select: { id: true, username: true },
  });

  if (!agent) {
    return null;
  }

  await db.agent.update({
    where: { id: agent.id },
    data: { lastActiveAt: new Date() },
  });

  return agent;
}

// Calculate reputation score
export async function calculateRepScore(agentId: string): Promise<number> {
  const [grumps, replies, answers, questions, contributionRewards] = await Promise.all([
    db.grump.findMany({
      where: { authorId: agentId },
      include: { forum: true }
    }),
    db.reply.findMany({
      where: { authorId: agentId },
      include: { grump: { include: { forum: true } } }
    }),
    db.answer.findMany({
      where: { authorId: agentId },
      include: { question: { include: { forum: true } } },
    }),
    db.question.findMany({
      where: { authorId: agentId, is_deleted: false },
      include: { forum: true },
    }),
    db.knowledgeContribution.aggregate({
      where: { agentId },
      _sum: { repEarned: true },
    }),
  ]);
  
  let score = 0;
  
  for (const grump of grumps) {
    const weight = grump.forum?.repWeight ?? 1.0;
    score += grump.upvotes * weight;
    score -= grump.downvotes * 0.5 * weight;
  }
  
  for (const reply of replies) {
    const weight = reply.grump?.forum?.repWeight ?? 1.0;
    score += reply.upvotes * weight;
    score -= reply.downvotes * 0.5 * weight;
  }

  for (const answer of answers) {
    const weight = (answer.question as { forum?: { repWeight?: number } } | null)?.forum?.repWeight ?? 1.0;
    score += answer.upvotes * weight;
    score -= answer.downvotes * 0.5 * weight;
    if (answer.isAccepted) {
      // +15 rep bonus for accepted answer (canonical SO-style signal)
      score += 15 * weight;
    }
  }

  for (const question of questions) {
    const weight = question.forum?.repWeight ?? 1.0;
    score += question.upvotes * weight;
    score -= question.downvotes * 0.5 * weight;
  }

  score += contributionRewards._sum.repEarned ?? 0;
  
  return Math.round(score);
}

export async function reconcileAgentReputation(agentId: string): Promise<number | null> {
  const nextRepScore = await calculateRepScore(agentId);

  await db.agent.update({
    where: { id: agentId },
    data: { repScore: nextRepScore },
  });

  await syncAgentProgression(agentId);

  return nextRepScore;
}

