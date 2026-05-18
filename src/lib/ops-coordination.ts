import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import type { AgentCoordinationMessage } from '@/lib/agents/tts-coordinator';
import { db } from '@/lib/db';

export type CoordinationAction = AgentCoordinationMessage['action'];

export interface CoordinationMessageRecord extends AgentCoordinationMessage {
  id: string;
  processedAt: string | null;
}

export interface SubmitCoordinationMessageInput {
  fromAgent: string;
  toAgents?: string[] | null;
  action: CoordinationAction;
  payload?: Record<string, unknown>;
  timestamp?: string;
  idempotencyKey?: string;
}

export interface ListCoordinationMessagesOptions {
  agent?: string;
  includeProcessed?: boolean;
  limit?: number;
  includeSentByAgent?: boolean;
}

type PersistedCoordinationMessage = {
  id: string;
  fromAgent: string;
  toAgents: string[];
  action: string;
  payload: Prisma.JsonValue;
  idempotencyKey: string;
  timestamp: Date;
  processedAt: Date | null;
};

type CoordinationMessageWhereInput = {
  processedAt?: null;
  OR?: Array<
    | { toAgents: { isEmpty: true } }
    | { toAgents: { has: string } }
    | { fromAgent: string }
  >;
};

type CoordinationMessageRepository = {
  create(args: {
    data: {
      fromAgent: string;
      toAgents: string[];
      action: string;
      payload: Record<string, unknown>;
      timestamp: Date;
      idempotencyKey: string;
    };
  }): Promise<PersistedCoordinationMessage>;
  findUnique(args: { where: { id?: string; idempotencyKey?: string } }): Promise<PersistedCoordinationMessage | null>;
  findMany(args: {
    where?: CoordinationMessageWhereInput;
    orderBy?: { timestamp: 'desc' | 'asc' };
    take?: number;
  }): Promise<PersistedCoordinationMessage[]>;
  update(args: {
    where: { id: string };
    data: { processedAt: Date };
  }): Promise<PersistedCoordinationMessage>;
  deleteMany(): Promise<unknown>;
};

const coordinationRepo = (db as typeof db & {
  coordinationMessage: CoordinationMessageRepository;
}).coordinationMessage;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_TARGET_AGENTS = 50;

function normalizeAgentName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTimestamp(value?: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function cloneMessage(message: CoordinationMessageRecord): CoordinationMessageRecord {
  return {
    ...message,
    toAgents: message.toAgents ? [...message.toAgents] : undefined,
    payload: normalizePayload(message.payload),
  };
}

function toMessageRecord(message: PersistedCoordinationMessage): CoordinationMessageRecord {
  return {
    id: message.id,
    fromAgent: message.fromAgent,
    toAgents: message.toAgents.length > 0 ? [...message.toAgents] : undefined,
    action: message.action as CoordinationAction,
    payload: normalizePayload(message.payload),
    timestamp: message.timestamp.toISOString(),
    idempotencyKey: message.idempotencyKey,
    processedAt: message.processedAt?.toISOString() ?? null,
  };
}

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit!)));
}

function compareMessagesDesc(a: CoordinationMessageRecord, b: CoordinationMessageRecord): number {
  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
}

export function sanitizeCoordinationAgentList(value: unknown, maxItems = MAX_TARGET_AGENTS): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const entry of value) {
    const normalized = normalizeAgentName(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    sanitized.push(normalized);
    seen.add(normalized);

    if (sanitized.length >= maxItems) {
      break;
    }
  }

  return sanitized.length > 0 ? sanitized : undefined;
}

export function isCoordinationMessageVisibleToAgent(
  message: CoordinationMessageRecord,
  agent: string,
  options?: { includeSentByAgent?: boolean },
): boolean {
  const normalizedAgent = normalizeAgentName(agent);
  if (!normalizedAgent) {
    return false;
  }

  const broadcast = !message.toAgents || message.toAgents.length === 0;
  const directRecipient = Boolean(message.toAgents?.includes(normalizedAgent));
  const sentByAgent = Boolean(options?.includeSentByAgent && message.fromAgent === normalizedAgent);

  return broadcast || directRecipient || sentByAgent;
}

export async function submitCoordinationMessage(
  input: SubmitCoordinationMessageInput,
): Promise<{ message: CoordinationMessageRecord; duplicate: boolean }> {
  const fromAgent = normalizeAgentName(input.fromAgent);
  if (!fromAgent) {
    throw new Error('fromAgent is required');
  }

  const idempotencyKey = normalizeAgentName(input.idempotencyKey) ?? randomUUID();
  const toAgents = sanitizeCoordinationAgentList(input.toAgents) ?? [];
  const payload = normalizePayload(input.payload);
  const timestamp = new Date(normalizeTimestamp(input.timestamp));

  try {
    const message = await coordinationRepo.create({
      data: {
        fromAgent,
        toAgents,
        action: input.action,
        payload,
        timestamp,
        idempotencyKey,
      },
    });

    return { message: toMessageRecord(message), duplicate: false };
  } catch (error) {
    const isDuplicateKeyError =
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
      (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002');

    if (isDuplicateKeyError) {
      const existing = await coordinationRepo.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return { message: toMessageRecord(existing), duplicate: true };
      }
    }

    throw error;
  }
}

export async function getCoordinationMessageById(id: string): Promise<CoordinationMessageRecord | null> {
  const message = await coordinationRepo.findUnique({ where: { id } });
  return message ? toMessageRecord(message) : null;
}

export async function listCoordinationMessages(
  options: ListCoordinationMessagesOptions = {},
): Promise<CoordinationMessageRecord[]> {
  const limit = clampLimit(options.limit);
  const normalizedAgent = normalizeAgentName(options.agent);

  const where: CoordinationMessageWhereInput = {
    ...(options.includeProcessed ? {} : { processedAt: null }),
  };

  if (normalizedAgent) {
    where.OR = [
      { toAgents: { isEmpty: true } },
      { toAgents: { has: normalizedAgent } },
      ...(options.includeSentByAgent ? [{ fromAgent: normalizedAgent }] : []),
    ];
  }

  const messages = await coordinationRepo.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  return messages.map(toMessageRecord).sort(compareMessagesDesc).map(cloneMessage);
}

export async function markCoordinationMessageProcessed(id: string): Promise<CoordinationMessageRecord | null> {
  const existing = await coordinationRepo.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }

  if (existing.processedAt) {
    return toMessageRecord(existing);
  }

  const updated = await coordinationRepo.update({
    where: { id },
    data: { processedAt: new Date() },
  });

  return toMessageRecord(updated);
}

export async function clearCoordinationMessagesForTests(): Promise<void> {
  await coordinationRepo.deleteMany();
}
