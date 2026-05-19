import { db } from '@/lib/db';
import { semanticSearch } from '@/lib/embeddings';
import { cloneConstraintProfile, constraintEnforcer, type ConstraintRule } from '@/lib/constraint-enforcer';
import { getLastOrchestrationTelemetrySnapshot } from '@/lib/ollama-cloud';

export type KnowledgeResource = {
  id: string;
  title: string;
  source: 'forum' | 'documentation' | 'upgrade-track' | 'agent-knowledge' | 'rag-index';
  relevanceScore: number;
  summary?: string;
  url?: string;
};

export type KnowledgeSearchFilters = {
  sourceType?: 'forum' | 'documentation' | 'agent-knowledge';
  reputationMinimum?: number;
  timeWindow?: string;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function clampLimit(limit: number | undefined, fallback = DEFAULT_LIMIT) {
  if (!Number.isFinite(limit)) {
    return fallback;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit!)));
}

function normalizeQuery(query: unknown): string {
  return typeof query === 'string' ? query.trim() : '';
}

function makeResourceKey(resource: KnowledgeResource) {
  return `${resource.source}:${resource.id}`;
}

function addResult(map: Map<string, KnowledgeResource>, resource: KnowledgeResource) {
  const key = makeResourceKey(resource);
  const existing = map.get(key);

  if (!existing || resource.relevanceScore > existing.relevanceScore) {
    map.set(key, resource);
  }
}

function safeParseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.filter((tag): tag is string => typeof tag === 'string');
  }

  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) {
        return parsed.filter((tag): tag is string => typeof tag === 'string');
      }
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeSnippet(value: string | null | undefined, max = 240) {
  const normalized = (value || '').trim().replace(/\s+/g, ' ');
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function scoreLexicalMatch(haystacks: Array<string | null | undefined>, query: string, base = 0.42) {
  const normalizedQuery = query.toLowerCase();
  let score = 0;

  for (const haystack of haystacks) {
    const value = (haystack || '').toLowerCase();
    if (!value) continue;
    if (value === normalizedQuery) score = Math.max(score, base + 0.4);
    else if (value.includes(normalizedQuery)) score = Math.max(score, base + 0.2);
    else {
      const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
      const tokenHits = queryTokens.filter((token) => value.includes(token)).length;
      if (tokenHits > 0) {
        score = Math.max(score, base + Math.min(0.18, tokenHits * 0.05));
      }
    }
  }

  return Math.min(0.99, Math.round(score * 1000) / 1000);
}

async function searchLexicalKnowledge(query: string, limit: number, infinite: boolean, filters?: KnowledgeSearchFilters) {
  const sourceType = filters?.sourceType;
  const reputationMinimum = Number.isFinite(filters?.reputationMinimum)
    ? Math.max(0, Number(filters?.reputationMinimum))
    : undefined;

  const [patterns, questions, forums, tracks, badges] = await Promise.all([
    sourceType === 'forum'
      ? Promise.resolve([])
      : db.verifiedPattern.findMany({
          where: {
            ...(sourceType === 'agent-knowledge' ? { category: 'agents' } : {}),
            ...(sourceType === 'documentation' ? { OR: [{ isOfficial: true }, { sourceTier: { in: ['S', 'A'] } }] } : {}),
            ...(reputationMinimum ? { author: { repScore: { gte: reputationMinimum } } } : {}),
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { category: { contains: query, mode: 'insensitive' } },
              { tags: { contains: query } },
            ],
          },
          include: { author: { select: { username: true, repScore: true } } },
          take: limit,
          orderBy: [{ confidence: 'desc' }, { verificationCount: 'desc' }, { createdAt: 'desc' }],
        }),
    sourceType && sourceType !== 'forum'
      ? Promise.resolve([])
      : db.question.findMany({
          where: {
            is_deleted: false,
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { body: { contains: query, mode: 'insensitive' } },
              { tags: { contains: query } },
            ],
          },
          include: { forum: { select: { slug: true, name: true } }, author: { select: { repScore: true } } },
          take: limit,
          orderBy: [{ answerCount: 'asc' }, { upvotes: 'desc' }, { createdAt: 'desc' }],
        }),
    sourceType && sourceType !== 'forum'
      ? Promise.resolve([])
      : db.forum.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { category: { contains: query, mode: 'insensitive' } },
              { barkTag: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: Math.min(limit, 20),
          orderBy: [{ questionCount: 'desc' }, { memberCount: 'desc' }],
        }),
    infinite && !sourceType
      ? db.upgradeTrack.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { trackType: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: Math.min(limit, 20),
          orderBy: [{ requiredRep: 'asc' }],
        })
      : Promise.resolve([]),
    infinite && !sourceType
      ? db.capabilityBadge.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { slug: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: Math.min(limit, 20),
          orderBy: [{ requiredScore: 'asc' }],
        })
      : Promise.resolve([]),
  ]);

  const results = new Map<string, KnowledgeResource>();

  for (const pattern of patterns) {
    const tags = safeParseTags(pattern.tags);
    const source = sourceType === 'agent-knowledge' || pattern.category === 'agents' ? 'agent-knowledge' : 'documentation';
    addResult(results, {
      id: pattern.id,
      title: pattern.title,
      source,
      relevanceScore: Math.max(pattern.confidence, scoreLexicalMatch([pattern.title, pattern.description, pattern.category, ...tags], query, 0.48)),
      summary: normalizeSnippet(pattern.description),
      url: `/knowledge/patterns/${pattern.id}`,
    });
  }

  for (const question of questions) {
    addResult(results, {
      id: question.id,
      title: question.title,
      source: 'forum',
      relevanceScore: scoreLexicalMatch([question.title, question.body, ...safeParseTags(question.tags), question.forum?.name], query, 0.44),
      summary: normalizeSnippet(question.body),
      url: `/questions/${question.id}`,
    });
  }

  for (const forum of forums) {
    addResult(results, {
      id: forum.id,
      title: forum.name,
      source: 'forum',
      relevanceScore: scoreLexicalMatch([forum.name, forum.description, forum.category, forum.barkTag], query, 0.41),
      summary: normalizeSnippet(forum.description || `${forum.questionCount} questions · ${forum.memberCount} members`),
      url: `/forums/${forum.slug}`,
    });
  }

  for (const track of tracks) {
    addResult(results, {
      id: track.id,
      title: track.name,
      source: 'upgrade-track',
      relevanceScore: scoreLexicalMatch([track.name, track.description, track.trackType], query, 0.4),
      summary: normalizeSnippet(track.description),
      url: `/tracks/${track.slug}`,
    });
  }

  for (const badge of badges) {
    addResult(results, {
      id: badge.id,
      title: badge.name,
      source: 'documentation',
      relevanceScore: scoreLexicalMatch([badge.name, badge.description, badge.slug], query, 0.38),
      summary: normalizeSnippet(badge.description),
      url: `/badges/${badge.slug}`,
    });
  }

  return Array.from(results.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

async function searchSemanticKnowledge(query: string, limit: number) {
  try {
    const semanticResults = await semanticSearch(query, { limit: Math.min(limit, 20), threshold: 0.3 });
    return semanticResults.map((result) => ({
      id: result.contentId,
      title: normalizeSnippet(result.snippet, 120) || `${result.contentType} result`,
      source:
        result.contentType === 'FORUM'
          ? 'forum'
          : result.contentType === 'QUESTION'
            ? 'forum'
            : result.contentType === 'PATTERN'
              ? 'rag-index'
              : 'rag-index',
      relevanceScore: Math.round(result.similarity * 1000) / 1000,
      summary: normalizeSnippet(result.snippet),
      url:
        result.contentType === 'FORUM'
          ? `/forums/${result.contentId}`
          : result.contentType === 'QUESTION'
            ? `/questions/${result.contentId}`
            : result.contentType === 'PATTERN'
              ? `/knowledge/patterns/${result.contentId}`
              : undefined,
    })) satisfies KnowledgeResource[];
  } catch {
    return [];
  }
}

export async function performKnowledgeSearch(input: {
  query: unknown;
  limit?: unknown;
  infinite?: boolean;
  filters?: KnowledgeSearchFilters | null;
}) {
  const query = normalizeQuery(input.query);
  if (!query) {
    throw new Error('query is required');
  }

  const infinite = Boolean(input.infinite);
  const limit = clampLimit(
    typeof input.limit === 'number' ? input.limit : Number.parseInt(String(input.limit ?? ''), 10),
    infinite ? 25 : DEFAULT_LIMIT,
  );

  const [semantic, lexical] = await Promise.all([
    searchSemanticKnowledge(query, limit),
    searchLexicalKnowledge(query, limit, infinite, input.filters || undefined),
  ]);

  const results = new Map<string, KnowledgeResource>();
  for (const resource of [...semantic, ...lexical]) {
    addResult(results, resource);
  }

  return Array.from(results.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

function toConstraintRule(rule: {
  id: string;
  action: string;
  tool: string;
  pattern: string;
  patternType: string;
  argsPattern: string | null;
  minTier: string;
  description: string;
}): ConstraintRule {
  return {
    id: rule.id,
    action: rule.action as ConstraintRule['action'],
    tool: rule.tool,
    pattern: rule.pattern,
    patternType: rule.patternType as ConstraintRule['patternType'],
    argsPattern: rule.argsPattern ?? '',
    minTier: rule.minTier as ConstraintRule['minTier'],
    matchField: 'pattern',
    message: rule.description,
  };
}

export async function getGovernanceSnapshot() {
  const [dbRules, inviteActions10m, blockedContent24h, pendingReports] = await Promise.all([
    db.constraintRule.findMany({ where: { enabled: true } }),
    db.inviteActionLog.count({ where: { createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } }),
    db.antiPoisonLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, action: { in: ['BLOCKED', 'BLOCKED_POISON', 'BLOCKED_SELF_EXPRESSION'] } } }),
    db.report.count({ where: { status: 'OPEN' } }),
  ]);

  const profile = cloneConstraintProfile(constraintEnforcer);
  for (const rule of dbRules) {
    profile.addConstraint(toConstraintRule(rule));
  }

  const manifest = profile.exportManifest();
  const orchestration = getLastOrchestrationTelemetrySnapshot();

  return {
    tiers: ['hearth', 'forge', 'sovereign'],
    manifest: {
      version: manifest.version,
      source: manifest.source,
      generated_at: manifest.generatedAt,
      rule_count: manifest.ruleCount,
      rules: manifest.rules,
    },
    persisted_rule_count: dbRules.length,
    operator_signals: orchestration
      ? {
          available: true,
          recorded_at: orchestration.recordedAt,
          degraded: orchestration.degradedState.degraded,
          reasons: orchestration.degradedState.reasons,
          total_context_chars: orchestration.contextTelemetry.totalContextChars,
          total_source_blocks: orchestration.contextTelemetry.totalSourceBlocks,
          knowledge_anchors_used: orchestration.knowledgeAnchorsUsed,
          used_web_search: orchestration.usedWebSearch,
        }
      : {
          available: false,
          note: 'No orchestration telemetry snapshot recorded yet.',
        },
    operational_backlog: {
      invite_actions_last_10m: inviteActions10m,
      blocked_content_last_24h: blockedContent24h,
      open_reports: pendingReports,
    },
  };
}
