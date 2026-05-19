import { NextRequest, NextResponse } from 'next/server';

import { performKnowledgeSearch } from '@/lib/knowledge-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const results = await performKnowledgeSearch({
      query: body?.query,
      limit: body?.limit,
      infinite: true,
      filters: body?.filters ?? null,
    });

    return NextResponse.json({
      query: typeof body?.query === 'string' ? body.query.trim() : '',
      results,
      count: results.length,
      scope: 'infinite-rag',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Infinite RAG search failed' },
      { status: 400 },
    );
  }
}
