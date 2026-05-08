import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { isAdminRequest } from '@/lib/admin';
import { getDensityMetrics, runDensityPass } from '@/lib/content-density';

// GET /api/v1/resident/grump/density — metrics
export async function GET(request: NextRequest) {
  try {
    const [authAgent, admin] = await Promise.all([
      authenticateAgentRequest(request),
      Promise.resolve(isAdminRequest(request)),
    ]);

    if (!authAgent && !admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const metrics = await getDensityMetrics();
    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Density metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/resident/grump/density — trigger a density pass
export async function POST(request: NextRequest) {
  try {
    const [authAgent, admin] = await Promise.all([
      authenticateAgentRequest(request),
      Promise.resolve(isAdminRequest(request)),
    ]);

    if (!authAgent && !admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(1, Number(body.limit) || 5), 20);

    const result = await runDensityPass(limit);

    // Batch auto-answer: call the resident auto-answer endpoint for each unanswered
    const unanswered = result.details.filter((d) => d.status === 'answered');
    const baseUrl = request.nextUrl.origin;

    for (const item of unanswered) {
      try {
        const autoAnswerRes = await fetch(`${baseUrl}/api/v1/resident/grump/auto-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': process.env.ADMIN_API_KEY || 'gr-admin-dev-key-grump-2026' },
          body: JSON.stringify({ question_id: item.questionId }),
        });

        if (autoAnswerRes.ok) {
          const data = await autoAnswerRes.json();
          if (data.answer_id) {
            item.answerId = data.answer_id;
            item.status = 'answered';
          } else {
            item.status = 'yield';
            item.reason = data.reason || 'auto-answer yielded';
          }
        }
      } catch {
        item.status = 'error';
        item.reason = 'failed to reach auto-answer endpoint';
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Density pass error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
