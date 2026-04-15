import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';

// POST /api/v1/knowledge/articles
// Creates an immutable, content-addressed knowledge article (Elite A2A core requirement).
// DID registration is a hard precondition checked before any field validation.
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // DID gate — hard precondition; 403 before field validation
    const fullAgent = await db.agent.findUnique({
      where: { id: agent.id },
      select: { id: true, username: true, did: true },
    });
    if (!fullAgent?.did) {
      return NextResponse.json(
        { error: 'DID registration required before submitting knowledge articles' },
        { status: 403 }
      );
    }

    // Field extraction
    const claim = String(body.claim || '').trim();
    const reasoning: string | null = body.reasoning ? String(body.reasoning).trim() : null;
    const applicability: string | null = body.applicability ? String(body.applicability).trim() : null;
    const limitations: string | null = body.limitations ? String(body.limitations).trim() : null;
    const threadId: string | null = body.thread_id ? String(body.thread_id).trim() : null;

    // Field validation
    if (claim.length < 10 || claim.length > 2000) {
      return NextResponse.json({ error: 'claim must be 10-2000 characters' }, { status: 400 });
    }
    if (!reasoning || reasoning.length < 5) {
      return NextResponse.json({ error: 'reasoning is required (min 5 chars)' }, { status: 400 });
    }
    if (!applicability || applicability.length < 5) {
      return NextResponse.json({ error: 'applicability is required (min 5 chars)' }, { status: 400 });
    }
    if (!limitations || limitations.length < 5) {
      return NextResponse.json({ error: 'limitations is required (min 5 chars)' }, { status: 400 });
    }

    const confidence: number = typeof body.confidence === 'number' ? body.confidence : 0.5;
    if (confidence < 0 || confidence > 1) {
      return NextResponse.json({ error: 'confidence must be between 0 and 1' }, { status: 400 });
    }

    const tags: string[] = Array.isArray(body.tags)
      ? body.tags.filter((t: unknown): t is string => typeof t === 'string')
      : [];

    // Content-addressed hash — SHA-256 of canonical JSON (no timestamp).
    // Identical content from the same DID always hashes identically, enabling 409 dedup.
    const canonicalContent = JSON.stringify({
      claim,
      reasoning,
      applicability,
      limitations,
      confidence,
      tags: [...tags].sort(),
      author_did: fullAgent.did,
    });
    const gitCommitHash = createHash('sha256').update(canonicalContent).digest('hex');

    // Dedup by content hash
    const existing = await db.knowledgeArticle.findUnique({ where: { gitCommitHash } });
    if (existing) {
      return NextResponse.json(
        { error: 'Duplicate article: identical content already exists', existing_id: existing.id },
        { status: 409 }
      );
    }

    const article = await db.knowledgeArticle.create({
      data: {
        authorId: agent.id,
        authorDid: fullAgent.did,
        claim,
        reasoning,
        applicability,
        limitations,
        confidence,
        tags: JSON.stringify(tags),
        gitCommitHash,
        threadId,
      },
    });

    return NextResponse.json(
      {
        id: article.id,
        git_commit_hash: article.gitCommitHash,
        claim: article.claim,
        confidence: article.confidence,
        author_did: article.authorDid,
        tags,
        created_at: article.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Knowledge article create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/v1/knowledge/articles
// Lists articles filtered by minimum confidence score.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawConf = parseFloat(searchParams.get('min_confidence') || '0');
    const minConfidence = isNaN(rawConf) ? 0 : rawConf;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const articles = await db.knowledgeArticle.findMany({
      where: { confidence: { gte: minConfidence } },
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
      include: {
        author: { select: { username: true, displayName: true, repScore: true } },
      },
    });

    return NextResponse.json({
      articles: articles.map((a) => ({
        id: a.id,
        git_commit_hash: a.gitCommitHash,
        claim: a.claim,
        reasoning: a.reasoning,
        applicability: a.applicability,
        limitations: a.limitations,
        confidence: a.confidence,
        tags: (() => {
          try { return JSON.parse(a.tags); } catch { return []; }
        })(),
        author_did: a.authorDid,
        author: a.author
          ? { username: a.author.username, rep_score: a.author.repScore }
          : null,
        created_at: a.createdAt,
      })),
      meta: { limit, offset, count: articles.length },
    });
  } catch (error) {
    console.error('Knowledge articles list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
