import { NextRequest, NextResponse } from 'next/server';
import { backfillEmbeddings } from '@/lib/embeddings';

// POST /api/v1/search/backfill - backfill embeddings for existing content
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const contentType = String(body.type || 'FORUM');
    const limit = Math.min(parseInt(String(body.limit || '50'), 10), 200);

    if (!['QUESTION', 'PATTERN', 'FORUM'].includes(contentType)) {
      return NextResponse.json({ error: 'type must be QUESTION, PATTERN, or FORUM' }, { status: 400 });
    }

    const count = await backfillEmbeddings(contentType, limit);

    return NextResponse.json({ content_type: contentType, backfilled: count });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
  }
}
