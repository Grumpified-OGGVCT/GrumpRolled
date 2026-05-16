import { NextRequest, NextResponse } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { getCloudFallbackRecommendationReport } from '@/lib/ollama-cloud';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const force = request.nextUrl.searchParams.get('refresh') === 'true';
    const report = await getCloudFallbackRecommendationReport(force);

    return NextResponse.json({
      ...report,
      approval_required: true,
      update_instruction:
        'Review candidates before changing GRUMPROLLED_CLOUD_FALLBACK_MODELS. The active fallback list is never changed automatically.',
    });
  } catch (error) {
    console.error('Cloud model recommendation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
