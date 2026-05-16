
import { createHash } from 'node:crypto';

import { db } from '@/lib/db';
import { publishLiveEvent } from '@/lib/events';

// ============================================================================
// Types
// ============================================================================

export type AuditEventType =
  | 'PATTERN_CREATED'
  | 'PATTERN_PROMOTED'
  | 'CONFIDENCE_CHANGED'
  | 'DELTA_INGESTED'
  | 'PATTERN_DEPRECATED'
  | 'PATTERN_APPLIED'
  | 'CONTRADICTION_DETECTED'
  | 'CONTRADICTION_RESOLVED';

export interface AuditEventInput {
  eventType: AuditEventType;
  actorId: string;
  targetId: string;
  previousState: unknown;
  newState: unknown;
  causalChain: string[];
  metadata?: Record<string, unknown>;
  triggeringIntentId?: string;
  sessionId?: string;
}

export interface AuditEvent extends AuditEventInput {
  eventId: string;
  timestamp: string;
}

// ============================================================================
// Deterministic event ID
// ============================================================================

function computeEventId(
  eventType: AuditEventType,
  actorId: string,
  targetId: string,
  timestamp: string,
  previousState: unknown,
): string {
  const stateStr =
    previousState === null || previousState === undefined
      ? 'null'
      : JSON.stringify(previousState);
  const base = `${eventType}\n${actorId}\n${targetId}\n${timestamp}\n${stateStr}`;
  return `sha256:${createHash('sha256').update(base).digest('hex')}`;
}

// ============================================================================
// 1. recordAuditEvent
// ============================================================================

export async function recordAuditEvent(input: AuditEventInput): Promise<AuditEvent> {
  const timestamp = new Date().toISOString();
  const eventId = computeEventId(
    input.eventType,
    input.actorId,
    input.targetId,
    timestamp,
    input.previousState,
  );

  const event: AuditEvent = {
    ...input,
    eventId,
    timestamp,
  };

  // Persist to PostgreSQL
  await db.auditEvent.create({
    data: {
      id: eventId,
      eventType: event.eventType,
      timestamp: new Date(timestamp),
      actorId: event.actorId,
      targetId: event.targetId,
      previousState: JSON.stringify(event.previousState),
      newState: JSON.stringify(event.newState),
      causalChain: JSON.stringify(event.causalChain),
      metadata: JSON.stringify(event.metadata ?? {}),
      triggeringIntentId: event.triggeringIntentId ?? null,
      sessionId: event.sessionId ?? null,
    },
  });

  // Publish to Redis for live subscribers
  await publishLiveEvent('audit:event', {
    eventId: event.eventId,
    eventType: event.eventType,
    actorId: event.actorId,
    targetId: event.targetId,
    causalChain: event.causalChain,
    timestamp: event.timestamp,
    triggeringIntentId: event.triggeringIntentId,
  });

  return event;
}

// ============================================================================
// 2. traceCausalChain
// ============================================================================

export interface CausalChainResult {
  rootEvent: AuditEvent | null;
  chain: AuditEvent[];
  depth: number;
}

export async function traceCausalChain(eventId: string): Promise<CausalChainResult> {
  const seed = await db.auditEvent.findUnique({ where: { id: eventId } });
  if (!seed) {
    throw new Error(`Audit event not found: ${eventId}`);
  }

  const seedEvent = rowToAuditEvent(seed);

  // Find the intent that triggered this event
  const intentId = seedEvent.triggeringIntentId || seedEvent.eventId;

  // All events sharing the same triggering intent (including the root)
  const rows = await db.auditEvent.findMany({
    where: {
      OR: [
        { triggeringIntentId: intentId },
        { id: intentId },
      ],
    },
    orderBy: { timestamp: 'asc' },
  });

  const chain = rows.map(rowToAuditEvent);

  // Root is the earliest event
  const root = chain[0] ?? null;

  return { rootEvent: root, chain, depth: chain.length };
}

// ============================================================================
// 3. queryAuditTrail
// ============================================================================

export interface AuditTrailFilters {
  actorId?: string;
  targetId?: string;
  eventType?: AuditEventType;
  timeRange?: { start: Date; end: Date };
  triggeringIntentId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export async function queryAuditTrail(
  filters: AuditTrailFilters = {},
): Promise<{ events: AuditEvent[]; total: number }> {
  const where: Record<string, unknown> = {};

  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.targetId) where.targetId = filters.targetId;
  if (filters.eventType) where.eventType = filters.eventType;
  if (filters.triggeringIntentId) where.triggeringIntentId = filters.triggeringIntentId;
  if (filters.sessionId) where.sessionId = filters.sessionId;

  if (filters.timeRange) {
    where.timestamp = {
      gte: filters.timeRange.start,
      lte: filters.timeRange.end,
    };
  }

  const limit = Math.min(filters.limit ?? 50, 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  const [rows, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: limit,
      skip: offset,
    }),
    db.auditEvent.count({ where }),
  ]);

  return {
    events: rows.map(rowToAuditEvent),
    total,
  };
}

// ============================================================================
// 4. reasonQuery
// ============================================================================

export interface RecourseResult {
  answer: string;
  supportingEvents: AuditEvent[];
  confidence: number;
}

/**
 * Answer a natural-language question using the audit trail.
 *
 * Supported patterns:
 *   "why was pattern X promoted?"  — trace the promotion + causal chain
 *   "who changed the confidence of pattern Y?" — find CONFIDENCE_CHANGED events
 *   "what happened between 14:00 and 14:05?" — time-range query
 *   "show events for target Z" — filter by targetId
 *   "who deprecated pattern X?" — find PATTERN_DEPRECATED events
 */
export async function reasonQuery(nlQuery: string): Promise<RecourseResult> {
  const q = nlQuery.toLowerCase().trim();

  // ── Time-range detection ──────────────────────────────────────────
  const timeMatch = q.match(
    /(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:-|to)\s*(\d{1,2}:\d{2}(?::\d{2})?)/,
  );
  if (timeMatch) {
    const today = new Date().toISOString().slice(0, 10);
    const startStr = timeMatch[1].length <= 5 ? `${timeMatch[1]}:00` : timeMatch[1];
    const endStr = timeMatch[2].length <= 5 ? `${timeMatch[2]}:00` : timeMatch[2];

    const result = await queryAuditTrail({
      timeRange: {
        start: new Date(`${today}T${startStr}Z`),
        end: new Date(`${today}T${endStr}Z`),
      },
    });

    return {
      answer: result.events.length > 0
        ? `Found ${result.events.length} event(s) between ${timeMatch[1]} and ${timeMatch[2]}.`
        : `No events found between ${timeMatch[1]} and ${timeMatch[2]}.`,
      supportingEvents: result.events,
      confidence: result.events.length > 0 ? 0.9 : 0.3,
    };
  }

  // ── "why" questions → trace promotion + causal chain ─────────────
  if (q.includes('why')) {
    // Extract a pattern name or target ID from the query
    const targetHint = extractTargetHint(q);

    if (targetHint) {
      // Search for promotion events matching the target
      const promoted = await db.auditEvent.findMany({
        where: {
          eventType: 'PATTERN_PROMOTED',
          ...buildTargetFilter(targetHint),
        },
        orderBy: { timestamp: 'desc' },
        take: 5,
      });

      if (promoted.length > 0) {
        const primary = promoted[0];
        const chain = await traceCausalChain(primary.id);
        return {
          answer: `Pattern was promoted via event ${primary.id}. Traced ${chain.depth} related event(s) in the causal chain.`,
          supportingEvents: chain.chain,
          confidence: 0.75,
        };
      }

      // Fallback: broad search for any events matching the target
      const broadResult = await queryAuditTrail({
        ...buildTargetFilter(targetHint),
        limit: 20,
      });
      return {
        answer: broadResult.events.length > 0
          ? `Found ${broadResult.events.length} event(s) related to '${targetHint}'. No promotion event found.`
          : `No events found for '${targetHint}'.`,
        supportingEvents: broadResult.events,
        confidence: broadResult.events.length > 0 ? 0.5 : 0.1,
      };
    }

    // Catch-all: return latest events
    const latest = await queryAuditTrail({ limit: 20 });
    return {
      answer: `No specific target detected. Showing ${latest.events.length} recent events.`,
      supportingEvents: latest.events,
      confidence: 0.3,
    };
  }

  // ── "who" questions → find actor-specific events ──────────────────
  if (q.includes('who')) {
    const isConfidence = q.includes('confidence');
    const isDeprecated = q.includes('deprecated');

    const eventType = isConfidence
      ? 'CONFIDENCE_CHANGED'
      : isDeprecated
        ? 'PATTERN_DEPRECATED'
        : undefined;

    const targetHint = extractTargetHint(q);

    const result = await queryAuditTrail({
      eventType,
      ...buildTargetFilter(targetHint),
      limit: 20,
    });

    return {
      answer: result.events.length > 0
        ? `Found ${result.events.length} event(s). Actors: ${[...new Set(result.events.map(e => e.actorId))].join(', ')}.`
        : 'No matching events found.',
      supportingEvents: result.events,
      confidence: result.events.length > 0 ? 0.8 : 0.2,
    };
  }

  // ── Default: full-text search across metadata and IDs ────────────
  const defaultResult = await queryAuditTrail({ limit: 20 });

  // Try to filter by any recognizable ID or pattern name in the query
  if (defaultResult.events.length > 0) {
    const words = q
      .split(/\s+/)
      .filter((w) => w.length > 4 && !['what', 'show', 'events', 'find', 'that', 'which', 'there', 'about'].includes(w));

    if (words.length > 0) {
      const filtered = defaultResult.events.filter((ev) => {
        const searchable = `${ev.eventType} ${ev.actorId} ${ev.targetId} ${JSON.stringify(ev.metadata)}`.toLowerCase();
        return words.some((w) => searchable.includes(w));
      });

      if (filtered.length > 0) {
        return {
          answer: `Found ${filtered.length} matching event(s).`,
          supportingEvents: filtered,
          confidence: 0.6,
        };
      }
    }
  }

  return {
    answer: `Found ${defaultResult.events.length} recent event(s). Try a more specific query.`,
    supportingEvents: defaultResult.events,
    confidence: defaultResult.events.length > 0 ? 0.4 : 0.0,
  };
}

// ── Helpers for reasonQuery ─────────────────────────────────────────────

function extractTargetHint(query: string): string | null {
  // Try to find a quoted string
  const quoted = query.match(/'([^']+)'|"([^"]+)"/);
  if (quoted) return (quoted[1] || quoted[2]).trim();

  // Try "pattern X" or "pattern named X"
  const patternMatch = query.match(
    /pattern\s+(?:named\s+|called\s+)?(\S+)/,
  );
  if (patternMatch) return patternMatch[1];

  // Try "for X" after keywords
  const forMatch = query.match(
    /(?:for|of|to|on)\s+(\S+)/g,
  );
  if (forMatch) {
    const last = forMatch[forMatch.length - 1];
    return last.replace(/^(?:for|of|to|on)\s+/, '').trim();
  }

  return null;
}

function buildTargetFilter(hint: string | null): {
  targetId?: string;
} {
  if (!hint) return {};
  // If it looks like an ID (contains hyphens, is > 10 chars), use exact match
  if (hint.length > 10 && /[a-zA-Z0-9_-]+/.test(hint)) {
    return { targetId: hint };
  }
  return {};
}

// ============================================================================
// 5. exportAuditTrail
// ============================================================================

export interface ExportOptions {
  since?: Date;
  until?: Date;
  eventTypes?: AuditEventType[];
}

export interface ExportBundle {
  version: string;
  generatedAt: string;
  integrityHash: string;
  eventCount: number;
  events: Array<{
    eventId: string;
    eventType: string;
    timestamp: string;
    actorId: string;
    targetId: string;
    previousState: unknown;
    newState: unknown;
    causalChain: string[];
    metadata: Record<string, unknown>;
    triggeringIntentId?: string;
    sessionId?: string;
  }>;
}

export async function exportAuditTrail(
  options: ExportOptions = {},
): Promise<ExportBundle> {
  const where: Record<string, unknown> = {};

  if (options.since || options.until) {
    where.timestamp = {
      ...(options.since ? { gte: options.since } : {}),
      ...(options.until ? { lte: options.until } : {}),
    };
  }

  if (options.eventTypes && options.eventTypes.length > 0) {
    where.eventType = { in: options.eventTypes };
  }

  const rows = await db.auditEvent.findMany({
    where,
    orderBy: { timestamp: 'asc' },
  });

  const events = rows.map((row) => {
    const parsed = rowToAuditEvent(row);
    return {
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      timestamp: parsed.timestamp,
      actorId: parsed.actorId,
      targetId: parsed.targetId,
      previousState: parsed.previousState,
      newState: parsed.newState,
      causalChain: parsed.causalChain,
      metadata: parsed.metadata ?? {},
      triggeringIntentId: parsed.triggeringIntentId,
      sessionId: parsed.sessionId,
    };
  });

  // Compute integrity hash over the serialized events
  const eventsJson = JSON.stringify(events);
  const integrityHash = createHash('sha256').update(eventsJson).digest('hex');

  return {
    version: 'HLF-v3',
    generatedAt: new Date().toISOString(),
    integrityHash,
    eventCount: events.length,
    events,
  };
}

// ============================================================================
// Row deserialization
// ============================================================================

interface AuditEventRow {
  id: string;
  eventType: string;
  timestamp: Date;
  actorId: string;
  targetId: string;
  previousState: string | null;
  newState: string | null;
  causalChain: string;
  metadata: string | null;
  triggeringIntentId: string | null;
  sessionId: string | null;
}

function rowToAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    eventId: row.id,
    eventType: row.eventType as AuditEventType,
    timestamp: row.timestamp.toISOString(),
    actorId: row.actorId,
    targetId: row.targetId,
    previousState: safeJsonParse(row.previousState, null),
    newState: safeJsonParse(row.newState, null),
    causalChain: safeJsonParse<string[]>(row.causalChain, []),
    metadata: safeJsonParse<Record<string, unknown>>(row.metadata, {}),
    triggeringIntentId: row.triggeringIntentId ?? undefined,
    sessionId: row.sessionId ?? undefined,
  };
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ============================================================================
// Mutation hook helpers
// ============================================================================

/**
 * Capture the previous state of a VerifiedPattern before mutation.
 * Call this before updating the pattern, then pass the result and the
 * updated pattern to recordAuditEvent.
 */
export async function capturePatternState(patternId: string): Promise<unknown> {
  const pattern = await db.verifiedPattern.findUnique({
    where: { id: patternId },
    select: {
      id: true,
      title: true,
      description: true,
      validationStatus: true,
      confidence: true,
      publishedAt: true,
      deprecatedAt: true,
      sourceTier: true,
      patternType: true,
      category: true,
    },
  });
  return pattern ?? null;
}

/**
 * Capture the previous state of a KnowledgeDelta before mutation.
 */
export async function captureDeltaState(deltaId: string): Promise<unknown> {
  const delta = await db.knowledgeDelta.findUnique({
    where: { id: deltaId },
    select: {
      id: true,
      status: true,
      confidence: true,
      deltaClass: true,
      deltaMagnitude: true,
      decisionRecommendation: true,
      targetPatternId: true,
    },
  });
  return delta ?? null;
}

// ============================================================================
// Integration points — where to add recordAuditEvent calls
// ============================================================================

/**
 * DOCUMENTATION: Hook into these mutation points:
 *
 * 1. src/app/api/v1/knowledge/patterns/route.ts — POST handler (line ~71)
 *    After `db.verifiedPattern.create(...)` succeeds, add:
 *    ```
 *    await recordAuditEvent({
 *      eventType: 'PATTERN_CREATED',
 *      actorId: agent.id,
 *      targetId: pattern.id,
 *      previousState: null,
 *      newState: { title, description, patternType, confidence, validationStatus },
 *      causalChain: [],
 *      metadata: { sourceTier, submittedBy: agent.username },
 *    });
 *    ```
 *
 * 2. src/app/api/v1/knowledge/patterns/[id]/promote/route.ts — POST handler
 *    Before `db.verifiedPattern.update(...)`, capture previous state:
 *    ```
 *    const prev = await capturePatternState(id);
 *    ```
 *    After update, record:
 *    ```
 *    await recordAuditEvent({
 *      eventType: 'PATTERN_PROMOTED',
 *      actorId: 'admin',
 *      targetId: id,
 *      previousState: prev,
 *      newState: { validationStatus, publishedAt },
 *      causalChain: [],
 *      metadata: { action, reviewRecommended },
 *    });
 *    ```
 *
 * 3. src/app/api/v1/knowledge/import/route.ts — POST handler (line ~108)
 *    After each `db.verifiedPattern.create(...)` in the loop:
 *    ```
 *    await recordAuditEvent({
 *      eventType: 'PATTERN_CREATED',
 *      actorId: authorId,
 *      targetId: created.id,
 *      previousState: null,
 *      newState: { title, description, confidence, validationStatus },
 *      causalChain: [],
 *      metadata: { importBatch: true, sourceTier },
 *    });
 *    ```
 *
 * 4. src/app/api/v1/knowledge/external-candidates/[id]/promote/route.ts
 *    After `promotePatternCandidate(...)` or `promoteDeltaCandidate(...)`:
 *    ```
 *    await recordAuditEvent({
 *      eventType: result.duplicate ? 'PATTERN_CREATED' : 'PATTERN_PROMOTED',
 *      actorId: candidate.queuedByAgentId,
 *      targetId: result.patternId || result.deltaId || candidate.id,
 *      previousState: { candidateStatus: 'QUEUED' },
 *      newState: result,
 *      causalChain: [],
 *      metadata: { sourcePlatform: candidate.sourcePlatform, candidateKind: candidate.candidateKind },
 *    });
 *    ```
 *
 * 5. src/lib/external-ingest.ts — promotePatternCandidate (line ~380)
 *    After `db.verifiedPattern.create(...)`:
 *    ```
 *    await recordAuditEvent({
 *      eventType: 'PATTERN_CREATED',
 *      actorId: candidate.queuedByAgentId,
 *      targetId: created.id,
 *      previousState: null,
 *      newState: { title, description, confidence, validationStatus: created.validationStatus },
 *      causalChain: [],
 *      metadata: { importedFromCandidateId: candidate.id, sourceTier },
 *    });
 *    ```
 *
 * 6. src/lib/external-ingest.ts — promoteDeltaCandidate (line ~449)
 *    After `db.knowledgeDelta.create(...)`:
 *    ```
 *    await recordAuditEvent({
 *      eventType: 'DELTA_INGESTED',
 *      actorId: candidate.queuedByAgentId,
 *      targetId: created.id,
 *      previousState: null,
 *      newState: { ...normalized.data, status: created.status },
 *      causalChain: [],
 *      metadata: { importedFromCandidateId: candidate.id },
 *    });
 *    ```
 *
 * 7. For CONFIDENCE_CHANGED — add before any confidence update:
 *    ```
 *    const prev = await capturePatternState(patternId);
 *    // ... perform update ...
 *    await recordAuditEvent({
 *      eventType: 'CONFIDENCE_CHANGED',
 *      actorId: triggeringAgentId,
 *      targetId: patternId,
 *      previousState: { confidence: prev.confidence },
 *      newState: { confidence: newConfidence },
 *      causalChain: [],
 *      metadata: { reason: 'validation_received' | 'admin_override' | 'delta_ingested' },
 *    });
 *    ```
 *
 * 8. For PATTERN_DEPRECATED — when setting deprecatedAt:
 *    ```
 *    const prev = await capturePatternState(patternId);
 *    // ... update with deprecatedAt ...
 *    await recordAuditEvent({
 *      eventType: 'PATTERN_DEPRECATED',
 *      actorId: adminId,
 *      targetId: patternId,
 *      previousState: prev,
 *      newState: { deprecatedAt: new Date().toISOString() },
 *      causalChain: [],
 *      metadata: { reason: 'superseded' | 'invalidated' | 'admin_action' },
 *    });
 *    ```
 *
 * 9. For CONTRADICTION_DETECTED / CONTRADICTION_RESOLVED:
 *    When two patterns have conflicting claims:
 *    ```
 *    await recordAuditEvent({
 *      eventType: 'CONTRADICTION_DETECTED',
 *      actorId: detectingAgentId,
 *      targetId: contradictionId,
 *      previousState: null,
 *      newState: { patternA: patternAId, patternB: patternBId, conflictDescription },
 *      causalChain: [],
 *      metadata: { confidenceA, confidenceB },
 *    });
 *    ```
 */

// ============================================================================
// Prisma schema additions needed
// ============================================================================

/**
 * Add this model to prisma/schema.prisma:
 *
 * ```prisma
 * model AuditEvent {
 *   id                  String   @id
 *   eventType           String
 *   timestamp           DateTime
 *   actorId             String
 *   targetId            String
 *   previousState       String?  // JSON string
 *   newState            String?  // JSON string
 *   causalChain         String   // JSON array of parent event IDs
 *   metadata            String?  // JSON object
 *   triggeringIntentId  String?
 *   sessionId           String?
 *   createdAt           DateTime @default(now())
 *
 *   @@index([eventType])
 *   @@index([actorId])
 *   @@index([targetId])
 *   @@index([timestamp])
 *   @@index([triggeringIntentId])
 *   @@index([eventType, timestamp])
 * }
 * ```
 *
 * After adding, run: npx prisma generate && npx prisma db push
 */
