import { createHash } from 'node:crypto';

import { NextRequest } from 'next/server';

import { getConfiguredAdminKey } from '@/lib/admin';
import { classifySourceTier, computeConfidence } from '@/lib/knowledge';

export type DeltaEvidenceInput = {
  type?: string;
  label?: string;
  body?: string;
};

export type DeltaImportItem = {
  title: string;
  source_kind?: string;
  source_url?: string;
  source_repo?: string;
  source_path?: string;
  source_commit?: string;
  source_published_at?: string;
  source_fingerprint?: string;
  topic_tags?: string[];
  forums?: string[];
  primary_mechanism?: string;
  architectural_blueprint?: unknown;
  immediate_project_applicability?: unknown;
  future_capability_value?: unknown;
  novel_paradigms?: unknown;
  delta_check?: {
    status?: string;
    delta_summary?: string;
    target_hint?: {
      pattern_title?: string;
      knowledge_article_title?: string;
      grump_title?: string;
    };
  };
  rules_and_constraints?: {
    logic_gates?: string[];
    dependencies?: string[];
    failure_modes?: string[];
  };
  decision_recommendation?: string;
  evidence_units?: DeltaEvidenceInput[];
  scoring?: {
    fact_check_score?: number;
    execution_score?: number;
    citation_score?: number;
    expert_score?: number;
    community_score?: number;
  };
  is_official?: boolean;
  confidence_shift?: number;
  delta_magnitude?: number;
};

export function isKnowledgeDeltaAdmin(request: NextRequest): boolean {
  const configured = getConfiguredAdminKey();
  const provided = request.headers.get('x-admin-key');
  if (!configured) return false;
  return provided === configured;
}

export function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function computeDeltaFingerprint(item: DeltaImportItem): string {
  const base = [
    item.title || '',
    item.source_url || '',
    item.primary_mechanism || '',
    item.delta_check?.status || '',
    item.delta_check?.delta_summary || '',
  ]
    .join('\n')
    .trim()
    .toLowerCase();

  return `sha256:${createHash('sha256').update(base).digest('hex')}`;
}

export function normalizeDeltaEvidenceUnits(item: DeltaImportItem): Array<{ evidenceType: string; label: string; body: string; evidenceOrder: number }> {
  const explicit = Array.isArray(item.evidence_units) ? item.evidence_units : [];
  const normalizedExplicit = explicit
    .map((entry, index) => ({
      evidenceType: String(entry.type || 'CLAIM').trim().toUpperCase(),
      label: String(entry.label || `Evidence ${index + 1}`).trim(),
      body: String(entry.body || '').trim(),
      evidenceOrder: index,
    }))
    .filter((entry) => entry.body.length > 0);

  if (normalizedExplicit.length > 0) {
    return normalizedExplicit;
  }

  const logicGates = safeStringArray(item.rules_and_constraints?.logic_gates);
  const dependencies = safeStringArray(item.rules_and_constraints?.dependencies);
  const failureModes = safeStringArray(item.rules_and_constraints?.failure_modes);

  return [
    ...logicGates.map((body, index) => ({ evidenceType: 'RULE', label: `Logic Gate ${index + 1}`, body, evidenceOrder: index })),
    ...dependencies.map((body, index) => ({ evidenceType: 'DEPENDENCY', label: `Dependency ${index + 1}`, body, evidenceOrder: logicGates.length + index })),
    ...failureModes.map((body, index) => ({ evidenceType: 'FAILURE_MODE', label: `Failure Mode ${index + 1}`, body, evidenceOrder: logicGates.length + dependencies.length + index })),
  ];
}

export function normalizeKnowledgeDeltaItem(item: DeltaImportItem) {
  const title = String(item.title || '').trim();
  const primaryMechanism = String(item.primary_mechanism || '').trim();
  const sourceFingerprint = String(item.source_fingerprint || computeDeltaFingerprint(item)).trim();
  const sourceKind = String(item.source_kind || 'OTHER').trim().toUpperCase();
  const sourceUrl = item.source_url ? String(item.source_url).trim() : null;
  const sourceRepo = item.source_repo ? String(item.source_repo).trim() : null;
  const sourcePath = item.source_path ? String(item.source_path).trim() : null;
  const sourceCommit = item.source_commit ? String(item.source_commit).trim() : null;
  const isOfficial = Boolean(item.is_official || false);
  const sourceTier = classifySourceTier({
    sourceRepo,
    sourcePath,
    sourceUrl,
    isOfficial,
  });

  const confidence = computeConfidence({
    sourceTier,
    factCheckScore: item.scoring?.fact_check_score,
    executionScore: item.scoring?.execution_score,
    citationScore: item.scoring?.citation_score,
    expertScore: item.scoring?.expert_score,
    communityScore: item.scoring?.community_score,
  });

  const topicTags = safeStringArray(item.topic_tags);
  const forums = safeStringArray(item.forums);
  const logicGates = safeStringArray(item.rules_and_constraints?.logic_gates);
  const dependencies = safeStringArray(item.rules_and_constraints?.dependencies);
  const failureModes = safeStringArray(item.rules_and_constraints?.failure_modes);
  const evidence = normalizeDeltaEvidenceUnits(item);

  return {
    title,
    primaryMechanism,
    sourceFingerprint,
    data: {
      sourceFingerprint,
      sourceKind,
      sourceTitle: title,
      sourceUrl,
      sourceRepo,
      sourcePath,
      sourceCommit,
      sourcePublishedAt: item.source_published_at ? new Date(item.source_published_at) : null,
      isOfficial,
      sourceTier,
      extractionVersion: 'omni-v1',
      primaryMechanism,
      architecturalBlueprint: stableStringify(item.architectural_blueprint || null) || null,
      immediateApplicability: stableStringify(item.immediate_project_applicability || null) || null,
      futureCapabilityValue: stableStringify(item.future_capability_value || null) || null,
      novelParadigms: stableStringify(item.novel_paradigms || null) || null,
      topicTags: JSON.stringify(topicTags),
      recommendedForums: JSON.stringify(forums),
      logicRules: JSON.stringify({ logic_gates: logicGates }),
      frictionPoints: JSON.stringify({ dependencies, failure_modes: failureModes }),
      deltaClass: String(item.delta_check?.status || 'MINOR_REFINEMENT').trim().toUpperCase(),
      deltaSummary: item.delta_check?.delta_summary ? String(item.delta_check.delta_summary).trim() : null,
      deltaMagnitude: typeof item.delta_magnitude === 'number' ? item.delta_magnitude : 0,
      confidence,
      confidenceShift: typeof item.confidence_shift === 'number' ? item.confidence_shift : null,
      forumRecommendation: forums[0] || null,
      decisionRecommendation: String(item.decision_recommendation || 'QUEUE_REVIEW').trim().toUpperCase(),
      status: 'INGESTED',
      evidence: {
        create: evidence,
      },
    },
  };
}

export function parseDeltaRecord(record: {
  topicTags?: string | null;
  recommendedForums?: string | null;
  architecturalBlueprint?: string | null;
  immediateApplicability?: string | null;
  futureCapabilityValue?: string | null;
  novelParadigms?: string | null;
  logicRules?: string | null;
  frictionPoints?: string | null;
}) {
  return {
    topic_tags: safeJsonParse<string[]>(record.topicTags, []),
    forums: safeJsonParse<string[]>(record.recommendedForums, []),
    architectural_blueprint: safeJsonParse<unknown>(record.architecturalBlueprint, null),
    immediate_project_applicability: safeJsonParse<unknown>(record.immediateApplicability, null),
    future_capability_value: safeJsonParse<unknown>(record.futureCapabilityValue, null),
    novel_paradigms: safeJsonParse<unknown>(record.novelParadigms, null),
    rules_and_constraints: {
      ...safeJsonParse<Record<string, unknown>>(record.logicRules, {}),
      ...safeJsonParse<Record<string, unknown>>(record.frictionPoints, {}),
    },
  };
}