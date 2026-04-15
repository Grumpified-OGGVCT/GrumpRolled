import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import {
  classifySourceTier,
  computeConfidence,
  isPublicPatternCandidate,
  isVerificationEligible,
} from '@/lib/knowledge';
import { syncAgentProgression } from '@/lib/progression-sync';

function safeParseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.filter((t): t is string => typeof t === 'string');
  }
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === 'string');
      }
    } catch {
      return [];
    }
  }
  return [];
}

// POST /api/v1/knowledge/patterns
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const patternType = String(body.pattern_type || 'WORKFLOW').trim();
    const category = String(body.category || 'coding').trim();
    const tags = safeParseTags(body.tags);

    if (title.length < 6 || title.length > 200) {
      return NextResponse.json({ error: 'Title must be 6-200 characters' }, { status: 400 });
    }
    if (description.length < 20 || description.length > 12000) {
      return NextResponse.json({ error: 'Description must be 20-12000 characters' }, { status: 400 });
    }

    const sourceRepo = body.source_repo ? String(body.source_repo) : null;
    const sourcePath = body.source_path ? String(body.source_path) : null;
    const sourceCommit = body.source_commit ? String(body.source_commit) : null;
    const sourceUrl = body.source_url ? String(body.source_url) : null;
    const isOfficial = Boolean(body.is_official || false);

    const sourceTier = classifySourceTier({ sourceRepo, sourcePath, sourceUrl, isOfficial });
    const confidence = computeConfidence({
      sourceTier,
      factCheckScore: typeof body.fact_check_score === 'number' ? body.fact_check_score : undefined,
      executionScore: typeof body.execution_score === 'number' ? body.execution_score : undefined,
      citationScore: typeof body.citation_score === 'number' ? body.citation_score : undefined,
      expertScore: typeof body.expert_score === 'number' ? body.expert_score : undefined,
      communityScore: typeof body.community_score === 'number' ? body.community_score : undefined,
    });

    const requestedStatus = String(body.validation_status || 'PENDING').toUpperCase();
    const validationStatus = requestedStatus === 'VERIFIED' ? 'PENDING' : requestedStatus;

    const pattern = await db.verifiedPattern.create({
      data: {
        authorId: agent.id,
        title,
        description,
        patternType,
        category,
        tags: JSON.stringify(tags),
        codeSnippet: body.code_snippet ? String(body.code_snippet) : null,
        language: body.language ? String(body.language) : null,
        isOfficial,
        sourceRepo,
        sourcePath,
        sourceCommit,
        sourceUrl,
        sourceTier,
        confidence,
        validationStatus,
        provenance: JSON.stringify({
          source_repo: sourceRepo,
          source_path: sourcePath,
          source_commit: sourceCommit,
          source_url: sourceUrl,
          source_tier: sourceTier,
          submitted_by: agent.username,
          submitted_at: new Date().toISOString(),
        }),
      },
    });

    await syncAgentProgression(agent.id);

    return NextResponse.json(
      {
        id: pattern.id,
        validation_status: pattern.validationStatus,
        source_tier: pattern.sourceTier,
        confidence: pattern.confidence,
        review_recommended: isVerificationEligible(pattern.confidence),
        publishable: false,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create pattern error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/v1/knowledge/patterns
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeDrafts = searchParams.get('include_drafts') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const where = includeDrafts
      ? {}
      : {
          validationStatus: 'VERIFIED',
          confidence: { gte: 0.65 },
          publishedAt: { not: null },
          deprecatedAt: null,
        };

    const patterns = await db.verifiedPattern.findMany({
      where,
      orderBy: [{ confidence: 'desc' }, { verificationCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
      include: {
        author: {
          select: { username: true, displayName: true, repScore: true },
        },
      },
    });

    return NextResponse.json({
      patterns: patterns.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        pattern_type: p.patternType,
        category: p.category,
        tags: safeParseTags(p.tags),
        source_tier: p.sourceTier,
        validation_status: p.validationStatus,
        confidence: p.confidence,
        review_recommended: isVerificationEligible(p.confidence),
        publishable: isPublicPatternCandidate({
          validationStatus: p.validationStatus,
          confidence: p.confidence,
          publishedAt: p.publishedAt,
          deprecatedAt: p.deprecatedAt,
        }),
        published_at: p.publishedAt?.toISOString() || null,
        author: p.author,
        created_at: p.createdAt.toISOString(),
      })),
      pagination: { limit, offset, has_more: patterns.length === limit },
    });
  } catch (error) {
    console.error('List patterns error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
