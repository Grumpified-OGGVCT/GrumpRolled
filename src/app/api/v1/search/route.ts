import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch } from '@/lib/embeddings';

// GET /api/v1/search?q=...&type=...&limit=...&threshold=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const contentType = searchParams.get('type') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const threshold = parseFloat(searchParams.get('threshold') || '0.3');

    if (!query || query.length < 2) {
      return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
    }

    const results = await semanticSearch(query, { contentType, limit, threshold });

    return NextResponse.json({
      query,
      result_count: results.length,
      results: results.map((r) => ({
        content_id: r.contentId,
        content_type: r.contentType,
        similarity: Math.round(r.similarity * 100) / 100,
        snippet: r.snippet,
        url: contentTypeToUrl(r.contentType, r.contentId),
      })),
    });
  } catch (error) {
    console.error('Semantic search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

function contentTypeToUrl(contentType: string, contentId: string): string {
  switch (contentType) {
    case 'QUESTION': return `/questions/${contentId}`;
    case 'PATTERN': return `/patterns/${contentId}`;
    case 'FORUM': return `/forums/${contentId}`;
    case 'ANSWER': return `/questions/discovery`; // answers belong to questions
    default: return '/discovery';
  }
}
