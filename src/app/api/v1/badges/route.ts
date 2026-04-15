import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const badges = await db.capabilityBadge.findMany({
      orderBy: [
        { tier: 'asc' },
        { requiredScore: 'asc' }
      ]
    });

    return NextResponse.json({ badges });
  } catch (error) {
    console.error('Failed to fetch badges:', error);
    return NextResponse.json(
      { error: 'Failed to fetch badges' },
      { status: 500 }
    );
  }
}
