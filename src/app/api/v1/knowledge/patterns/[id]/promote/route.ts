import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getConfiguredAdminKey } from '@/lib/admin';
import { isPublishable, isVerificationEligible } from '@/lib/knowledge';
import { syncAgentProgression } from '@/lib/progression-sync';

function isAdmin(request: NextRequest): boolean {
  const configured = getConfiguredAdminKey();
  const provided = request.headers.get('x-admin-key');
  if (!configured) return false;
  return provided === configured;
}

// POST /api/v1/knowledge/patterns/[id]/promote
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const action = String(body.action || 'verify').toLowerCase();

    const pattern = await db.verifiedPattern.findUnique({ where: { id } });
    if (!pattern) {
      return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
    }

    if (action === 'reject') {
      const rejected = await db.verifiedPattern.update({
        where: { id },
        data: { validationStatus: 'REJECTED', publishedAt: null },
      });

      await syncAgentProgression(rejected.authorId);

      await db.adminActionLog.create({
        data: {
          action: 'PATTERN_REJECT',
          targetType: 'VERIFIED_PATTERN',
          targetId: rejected.id,
          metadata: JSON.stringify({ confidence: rejected.confidence, source_tier: rejected.sourceTier }),
        },
      });

      return NextResponse.json({
        id: rejected.id,
        validation_status: rejected.validationStatus,
        publishable: false,
        published_at: null,
      });
    }

    if (action === 'publish') {
      if (pattern.validationStatus !== 'VERIFIED') {
        return NextResponse.json(
          { error: 'Pattern must be VERIFIED before publication.' },
          { status: 409 }
        );
      }

      if (!isVerificationEligible(pattern.confidence)) {
        return NextResponse.json(
          { error: 'Pattern confidence is below the publication threshold.' },
          { status: 409 }
        );
      }

      const published = await db.verifiedPattern.update({
        where: { id },
        data: {
          publishedAt: pattern.publishedAt ?? new Date(),
        },
      });

      await db.adminActionLog.create({
        data: {
          action: 'PATTERN_PUBLISH',
          targetType: 'VERIFIED_PATTERN',
          targetId: published.id,
          metadata: JSON.stringify({
            confidence: published.confidence,
            source_tier: published.sourceTier,
            published_at: published.publishedAt?.toISOString() || null,
          }),
        },
      });

      return NextResponse.json({
        id: published.id,
        validation_status: published.validationStatus,
        confidence: published.confidence,
        publishable: isPublishable(published.validationStatus, published.confidence, published.publishedAt),
        published_at: published.publishedAt?.toISOString() || null,
        publish_gate: 'passed',
      });
    }

    const verified = await db.verifiedPattern.update({
      where: { id },
      data: {
        validationStatus: 'VERIFIED',
        publishedAt: null,
      },
    });

    await syncAgentProgression(verified.authorId);

    const reviewRecommended = isVerificationEligible(verified.confidence);

    await db.adminActionLog.create({
      data: {
        action: 'PATTERN_VERIFY',
        targetType: 'VERIFIED_PATTERN',
        targetId: verified.id,
        metadata: JSON.stringify({
          confidence: verified.confidence,
          source_tier: verified.sourceTier,
          review_recommended: reviewRecommended,
          publishable: false,
        }),
      },
    });

    return NextResponse.json({
      id: verified.id,
      validation_status: verified.validationStatus,
      confidence: verified.confidence,
      review_recommended: reviewRecommended,
      publishable: false,
      published_at: null,
      publish_gate: reviewRecommended ? 'ready_for_publish_action' : 'blocked: confidence<0.65',
    });
  } catch (error) {
    console.error('Promote pattern error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
