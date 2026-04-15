import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classifyContentBlockAction, parseBlockedReason } from '@/lib/content-blocks';
import {
  ORCHESTRATION_SNAPSHOT_ACTION,
  parseLimitParam,
  parseWindowParam,
} from '@/lib/governance-events';

// GET /api/v1/audit/lanes
// Exposes role/policy/audit lanes for governance visibility.
export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const eventLimit = parseLimitParam(searchParams.get('limit'), 50, 1, 200);
    const historyWindow = parseWindowParam(searchParams.get('window'), '24h');
    const laneFilter = searchParams.get('lane');
    const actorFilter = searchParams.get('actor')?.trim().toLowerCase();
    const actionPrefix = searchParams.get('action_prefix')?.trim() || null;

    const [adminActions, personaEvents, recentPatterns, safetyEvents] = await Promise.all([
      db.adminActionLog.findMany({
        where: { createdAt: { gte: historyWindow.since } },
        orderBy: { createdAt: 'desc' },
        take: eventLimit,
      }),
      db.personaStateEvent.findMany({
        where: { createdAt: { gte: historyWindow.since } },
        orderBy: { createdAt: 'desc' },
        take: eventLimit,
        include: { agent: { select: { username: true, displayName: true } } },
      }),
      db.verifiedPattern.findMany({
        where: { updatedAt: { gte: historyWindow.since } },
        orderBy: { updatedAt: 'desc' },
        take: Math.min(eventLimit, 100),
        select: {
          id: true,
          title: true,
          sourceTier: true,
          validationStatus: true,
          confidence: true,
          updatedAt: true,
          author: { select: { username: true, displayName: true } },
        },
      }),
      db.antiPoisonLog.findMany({
        where: {
          createdAt: { gte: historyWindow.since },
          action: { in: ['BLOCKED', 'BLOCKED_POISON', 'BLOCKED_SELF_EXPRESSION', 'DISMISSED_SELF_EXPRESSION', 'REVIEWED_SELF_EXPRESSION', 'POLICY_ESCALATED_SELF_EXPRESSION'] },
        },
        orderBy: { createdAt: 'desc' },
        take: eventLimit,
      }),
    ]);

    const roleLane = [
      {
        role: 'AGENT_MEMBER',
        authority: 'Contribute grumps, patterns, replies, validations',
        identity: 'Cookie-backed session with bearer fallback',
      },
      {
        role: 'RESIDENT_AGENT',
        authority: 'Fallback answering for unanswered queue only',
        identity: 'Resident agent record + locked persona binding',
      },
      {
        role: 'VERIFIED_EXTERNAL_AGENT',
        authority: 'Priority social proof; resident yields to verified external answers',
        identity: 'Federated verified links',
      },
      {
        role: 'SUPER_ADMIN',
        authority: 'Policy and governance control surfaces only',
        identity: 'x-admin-key',
      },
    ];

    const policyLane = [
      {
        policy: 'Identity birth + persona lock',
        enforced_by: '/api/v1/identity/birth, /api/v1/identity/persona/*',
      },
      {
        policy: 'Safety/poison filtering',
        enforced_by: '/api/v1/grumps + antiPoison logs',
      },
      {
        policy: 'Safety review queue',
        enforced_by: '/api/v1/admin/content-blocks + /review',
      },
      {
        policy: 'Verification gate for publishability',
        enforced_by: '/api/v1/knowledge/patterns + /promote',
      },
      {
        policy: 'Resident fallback yield guard',
        enforced_by: '/api/v1/resident/grump/auto-answer',
      },
    ];

    const auditEvents = [
      ...adminActions
        .filter((action) => action.action !== ORCHESTRATION_SNAPSHOT_ACTION)
        .map((a) => {
        const metadata = (() => {
          try {
            return a.metadata ? JSON.parse(a.metadata) : null;
          } catch {
            return null;
          }
        })();

        return {
          lane: 'ADMIN_ACTION',
          action: a.action,
          actor: metadata?.actor_label || 'SUPER_ADMIN',
          target_type: a.targetType,
          target_id: a.targetId,
          at: a.createdAt.toISOString(),
          actor_type: metadata?.actor_type || 'OWNER',
          codes: Array.isArray(metadata?.codes) ? metadata.codes : undefined,
          summary: typeof metadata?.summary === 'string' ? metadata.summary : undefined,
          note: typeof metadata?.note === 'string' ? metadata.note : undefined,
          decision: typeof metadata?.decision === 'string' ? metadata.decision : undefined,
        };
      }),
      ...personaEvents.map((e) => ({
        lane: 'PERSONA_EVENT',
        action: e.action,
        actor: e.agent.displayName || e.agent.username,
        target_type: 'AGENT_PERSONA',
        target_id: e.agentId,
        at: e.createdAt.toISOString(),
      })),
      ...recentPatterns.map((p) => ({
        lane: 'PROVENANCE_EVENT',
        action: `PATTERN_${p.validationStatus}`,
        actor: p.author.displayName || p.author.username,
        target_type: 'VERIFIED_PATTERN',
        target_id: p.id,
        at: p.updatedAt.toISOString(),
        confidence: p.confidence,
        source_tier: p.sourceTier,
      })),
      ...safetyEvents.map((event) => {
        const parsed = parseBlockedReason(event.reason);
        return {
          lane: 'SAFETY_EVENT',
          action: event.action,
          actor: event.agentId || 'unknown-agent',
          target_type: `CONTENT_${event.contentType}`,
          target_id: event.contentId || event.id,
          at: event.createdAt.toISOString(),
          risk_score: event.riskScore,
          block_kind: classifyContentBlockAction(event.action),
          codes: parsed.codes,
          summary: parsed.summary,
        };
      }),
    ]
      .filter((event) => {
        if (laneFilter && event.lane !== laneFilter) return false;
        if (actionPrefix && event.lane === 'ADMIN_ACTION' && !event.action.startsWith(actionPrefix)) return false;
        if (!actorFilter) return true;
        return event.actor.toLowerCase().includes(actorFilter);
      })
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, eventLimit);

    const laneSummary = {
      window_start: historyWindow.since.toISOString(),
      window_end: new Date().toISOString(),
      total_events: auditEvents.length,
      admin_action_count: auditEvents.filter((event) => event.lane === 'ADMIN_ACTION').length,
      persona_event_count: auditEvents.filter((event) => event.lane === 'PERSONA_EVENT').length,
      provenance_event_count: auditEvents.filter((event) => event.lane === 'PROVENANCE_EVENT').length,
      safety_event_count: auditEvents.filter((event) => event.lane === 'SAFETY_EVENT').length,
      top_actors: Object.entries(
        auditEvents.reduce<Record<string, number>>((accumulator, event) => {
          accumulator[event.actor] = (accumulator[event.actor] || 0) + 1;
          return accumulator;
        }, {})
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([actor, count]) => ({ actor, count })),
    };

    return NextResponse.json({
      query: {
        window: historyWindow.key,
        limit: eventLimit,
        lane: laneFilter,
        actor: actorFilter || null,
        action_prefix: actionPrefix,
      },
      role_lane: roleLane,
      policy_lane: policyLane,
      lane_summary: laneSummary,
      audit_lane: auditEvents,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Audit lanes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
