import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  adminActionLog: { findMany: vi.fn() },
  personaStateEvent: { findMany: vi.fn() },
  verifiedPattern: { findMany: vi.fn() },
  antiPoisonLog: { findMany: vi.fn() },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

describe('/api/v1/audit/lanes route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    dbMock.adminActionLog.findMany.mockResolvedValue([
      {
        action: 'LLM_ORCHESTRATION_SNAPSHOT',
        targetType: 'LLM_ORCHESTRATION',
        targetId: 'abc123',
        metadata: JSON.stringify({ actor_label: 'answer-orchestration', actor_type: 'SYSTEM' }),
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
      },
      {
        action: 'PATTERN_VERIFY',
        targetType: 'VERIFIED_PATTERN',
        targetId: 'pattern-1',
        metadata: JSON.stringify({ actor_label: 'super-admin', actor_type: 'OWNER' }),
        createdAt: new Date('2026-04-01T01:00:00.000Z'),
      },
      {
        action: 'SELF_EXPRESSION_POLICY_ESCALATE',
        targetType: 'ANTI_POISON_PATTERN',
        targetId: 'block-pattern-1',
        metadata: JSON.stringify({
          actor_label: 'super-admin',
          actor_type: 'OWNER',
          codes: ['USER_SPECIFIC_FRAMING'],
          summary: 'User-specific framing detected',
          note: 'Escalated for policy review.',
          decision: 'policy_escalate',
        }),
        createdAt: new Date('2026-04-01T01:30:00.000Z'),
      },
    ]);

    dbMock.personaStateEvent.findMany.mockResolvedValue([
      {
        action: 'LOCK',
        agentId: 'agent-1',
        createdAt: new Date('2026-04-01T02:00:00.000Z'),
        agent: { username: 'alpha', displayName: 'Alpha' },
      },
    ]);

    dbMock.verifiedPattern.findMany.mockResolvedValue([
      {
        id: 'pattern-2',
        title: 'Pattern Two',
        sourceTier: 'A',
        validationStatus: 'VERIFIED',
        confidence: 0.9,
        updatedAt: new Date('2026-04-01T03:00:00.000Z'),
        author: { username: 'beta', displayName: 'Beta' },
      },
    ]);

    dbMock.antiPoisonLog.findMany.mockResolvedValue([
      {
        id: 'block-1',
        action: 'BLOCKED_SELF_EXPRESSION',
        contentType: 'GRUMP',
        contentId: null,
        agentId: 'agent-7',
        riskScore: 0.66,
        reason: 'USER_SPECIFIC_FRAMING | User-specific framing detected',
        createdAt: new Date('2026-04-01T04:00:00.000Z'),
      },
    ]);
  });

  it('filters audit lanes by lane, actor, window, and limit while returning summary counts', async () => {
    const { GET } = await import('../../src/app/api/v1/audit/lanes/route');
    const response = await GET(
      new Request('http://localhost/api/v1/audit/lanes?window=24h&limit=10&lane=ADMIN_ACTION&actor=admin&action_prefix=SELF_EXPRESSION_')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.query).toEqual({ window: '24h', limit: 10, lane: 'ADMIN_ACTION', actor: 'admin', action_prefix: 'SELF_EXPRESSION_' });
    expect(body.audit_lane).toHaveLength(1);
    expect(body.audit_lane[0].action).toBe('SELF_EXPRESSION_POLICY_ESCALATE');
    expect(body.audit_lane[0].note).toBe('Escalated for policy review.');
    expect(body.lane_summary.total_events).toBe(1);
    expect(body.lane_summary.admin_action_count).toBe(1);
    expect(body.lane_summary.top_actors[0]).toEqual({ actor: 'super-admin', count: 1 });
  });

  it('includes safety events in the audit lane and summary when requested', async () => {
    const { GET } = await import('../../src/app/api/v1/audit/lanes/route');
    const response = await GET(
      new Request('http://localhost/api/v1/audit/lanes?window=24h&limit=10&lane=SAFETY_EVENT')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.audit_lane).toHaveLength(1);
    expect(body.audit_lane[0]).toMatchObject({
      lane: 'SAFETY_EVENT',
      action: 'BLOCKED_SELF_EXPRESSION',
      actor: 'agent-7',
      block_kind: 'self_expression',
      codes: ['USER_SPECIFIC_FRAMING'],
    });
    expect(body.lane_summary.safety_event_count).toBe(1);
  });
});