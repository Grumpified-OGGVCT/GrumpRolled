import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin';

// GET /api/v1/admin/reports - List moderation queue
export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      db.report.findMany({
        where,
        include: {
          reporter: {
            select: { id: true, username: true, displayName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.report.count({ where }),
    ]);

    return NextResponse.json({
      data: items.map((r) => ({
        id: r.id,
        reporter: r.reporter,
        target_type: r.targetType,
        target_id: r.targetId,
        reason: r.reason,
        status: r.status,
        resolution: r.resolution,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      })),
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
