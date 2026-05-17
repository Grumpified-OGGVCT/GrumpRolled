import { randomUUID } from 'node:crypto';

import type { AgentCoordinationMessage } from '@/lib/agents/tts-coordinator';

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

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_TARGET_AGENTS = 50;

const coordinationMessages: CoordinationMessageRecord[] = [];
const coordinationMessageIdsByKey = new Map<string, string>();

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

export function submitCoordinationMessage(
  input: SubmitCoordinationMessageInput,
): { message: CoordinationMessageRecord; duplicate: boolean } {
  const fromAgent = normalizeAgentName(input.fromAgent);
  if (!fromAgent) {
    throw new Error('fromAgent is required');
  }

  const idempotencyKey = normalizeAgentName(input.idempotencyKey) ?? randomUUID();
  const existingId = coordinationMessageIdsByKey.get(idempotencyKey);
  if (existingId) {
    const existing = coordinationMessages.find((message) => message.id === existingId);
    if (existing) {
      return { message: cloneMessage(existing), duplicate: true };
    }
  }

  const message: CoordinationMessageRecord = {
    id: randomUUID(),
    fromAgent,
    toAgents: sanitizeCoordinationAgentList(input.toAgents),
    action: input.action,
    payload: normalizePayload(input.payload),
    timestamp: normalizeTimestamp(input.timestamp),
    idempotencyKey,
    processedAt: null,
  };

  coordinationMessages.push(message);
  coordinationMessageIdsByKey.set(idempotencyKey, message.id);

  return { message: cloneMessage(message), duplicate: false };
}

export function getCoordinationMessageById(id: string): CoordinationMessageRecord | null {
  const message = coordinationMessages.find((entry) => entry.id === id);
  return message ? cloneMessage(message) : null;
}

export function listCoordinationMessages(options: ListCoordinationMessagesOptions = {}): CoordinationMessageRecord[] {
  const limit = clampLimit(options.limit);
  const normalizedAgent = normalizeAgentName(options.agent);

  const filtered = coordinationMessages.filter((message) => {
    if (!options.includeProcessed && message.processedAt) {
      return false;
    }

    if (!normalizedAgent) {
      return true;
    }

    return isCoordinationMessageVisibleToAgent(message, normalizedAgent, {
      includeSentByAgent: options.includeSentByAgent,
    });
  });

  return filtered.sort(compareMessagesDesc).slice(0, limit).map(cloneMessage);
}

export function markCoordinationMessageProcessed(id: string): CoordinationMessageRecord | null {
  const message = coordinationMessages.find((entry) => entry.id === id);
  if (!message) {
    return null;
  }

  if (!message.processedAt) {
    message.processedAt = new Date().toISOString();
  }

  return cloneMessage(message);
}

export function clearCoordinationMessagesForTests(): void {
  coordinationMessages.splice(0, coordinationMessages.length);
  coordinationMessageIdsByKey.clear();
}
