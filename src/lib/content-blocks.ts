export type ContentBlockKind = 'poison' | 'self_expression' | 'other';
export type ContentBlockReviewDecision = 'dismiss' | 'mark_reviewed' | 'policy_escalate';

export function parseBlockedReason(reason: string | null) {
  if (!reason) {
    return { codes: [] as string[], summary: '' };
  }

  const [codesPart, summaryPart] = reason.split(' | ', 2);
  const codes = summaryPart
    ? codesPart.split(',').map((code) => code.trim()).filter(Boolean)
    : [];

  return {
    codes,
    summary: summaryPart || reason,
  };
}

export function classifyContentBlockAction(action: string): ContentBlockKind {
  if (action === 'BLOCKED_SELF_EXPRESSION') return 'self_expression';
  if (action === 'BLOCKED_POISON' || action === 'BLOCKED') return 'poison';
  return 'other';
}

export function isPendingSelfExpressionAction(action: string) {
  return action === 'BLOCKED_SELF_EXPRESSION';
}

export function reviewDecisionToAction(decision: ContentBlockReviewDecision) {
  if (decision === 'dismiss') return 'DISMISSED_SELF_EXPRESSION';
  if (decision === 'mark_reviewed') return 'REVIEWED_SELF_EXPRESSION';
  return 'POLICY_ESCALATED_SELF_EXPRESSION';
}

export function reviewDecisionToAdminAction(decision: ContentBlockReviewDecision) {
  if (decision === 'dismiss') return 'SELF_EXPRESSION_DISMISS';
  if (decision === 'mark_reviewed') return 'SELF_EXPRESSION_MARK_REVIEWED';
  return 'SELF_EXPRESSION_POLICY_ESCALATE';
}

type LogLike = {
  id: string;
  action: string;
  reason: string;
  riskScore: number;
  createdAt: Date;
};

export function buildSelfExpressionReviewQueue(rows: LogLike[]) {
  const groups = new Map<string, {
    signature: string;
    count: number;
    codes: string[];
    summary: string;
    latestCreatedAt: Date;
    avgRiskScore: number;
    eventIds: string[];
  }>();

  for (const row of rows) {
    if (!isPendingSelfExpressionAction(row.action)) continue;

    const parsed = parseBlockedReason(row.reason);
    const existing = groups.get(row.reason);
    if (existing) {
      existing.count += 1;
      existing.eventIds.push(row.id);
      existing.avgRiskScore = ((existing.avgRiskScore * (existing.count - 1)) + row.riskScore) / existing.count;
      if (row.createdAt > existing.latestCreatedAt) {
        existing.latestCreatedAt = row.createdAt;
      }
      continue;
    }

    groups.set(row.reason, {
      signature: row.reason,
      count: 1,
      codes: parsed.codes,
      summary: parsed.summary,
      latestCreatedAt: row.createdAt,
      avgRiskScore: row.riskScore,
      eventIds: [row.id],
    });
  }

  return Array.from(groups.values())
    .filter((group) => group.count >= 2)
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return right.latestCreatedAt.getTime() - left.latestCreatedAt.getTime();
    })
    .map((group) => ({
      signature: group.signature,
      count: group.count,
      codes: group.codes,
      summary: group.summary,
      avg_risk_score: group.avgRiskScore,
      latest_created_at: group.latestCreatedAt.toISOString(),
      event_ids: group.eventIds,
    }));
}