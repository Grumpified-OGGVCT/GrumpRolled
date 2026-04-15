import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { isKnowledgeDeltaAdmin, normalizeKnowledgeDeltaItem, type DeltaImportItem } from '@/lib/knowledge-deltas';

// POST /api/v1/knowledge/deltas/import
export async function POST(request: NextRequest) {
  try {
    if (!isKnowledgeDeltaAdmin(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const items: DeltaImportItem[] = Array.isArray(body.items) ? body.items : [];
    const authorId = String(body.author_id || '').trim();
    const dryRun = Boolean(body.dry_run ?? false);
    const runId = body.run_id ? String(body.run_id).trim() : null;
    const sourceFamily = body.source_family ? String(body.source_family).trim() : null;
    const generatorLabel = body.generator ? String(body.generator).trim() : null;

    if (!authorId) {
      return NextResponse.json({ error: 'author_id is required.' }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'items[] must contain at least one item.' }, { status: 400 });
    }

    const createdIds: string[] = [];
    const rejected: Array<{ index: number; reason: string }> = [];
    const duplicates: Array<{ index: number; source_fingerprint: string; existing_id?: string }> = [];

    for (let i = 0; i < items.length; i += 1) {
      const normalized = normalizeKnowledgeDeltaItem(items[i]);

      if (normalized.title.length < 6) {
        rejected.push({ index: i, reason: 'Invalid title length.' });
        continue;
      }

      if (normalized.primaryMechanism.length < 12) {
        rejected.push({ index: i, reason: 'primary_mechanism is required and must be meaningful.' });
        continue;
      }

      const existing = await db.knowledgeDelta.findUnique({
        where: { sourceFingerprint: normalized.sourceFingerprint },
        select: { id: true },
      });

      if (existing) {
        duplicates.push({ index: i, source_fingerprint: normalized.sourceFingerprint, existing_id: existing.id });
        continue;
      }

      if (dryRun) {
        createdIds.push(`dry-run-${i}`);
        continue;
      }

      const created = await db.knowledgeDelta.create({
        data: {
          authorId,
          runId,
          sourceFamily,
          generatorLabel,
          ...normalized.data,
        },
      });

      createdIds.push(created.id);
    }

    return NextResponse.json({
      imported: createdIds.length,
      rejected_count: rejected.length,
      duplicate_count: duplicates.length,
      rejected,
      duplicates,
      dry_run: dryRun,
      ids: createdIds,
      run_id: runId,
      source_family: sourceFamily,
      generator: generatorLabel,
    });
  } catch (error) {
    console.error('Knowledge delta import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}