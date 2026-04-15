import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const tracks = await db.upgradeTrack.findMany({
      orderBy: [
        { trackType: 'asc' },
        { requiredRep: 'asc' }
      ]
    });

    return NextResponse.json({ tracks });
  } catch (error) {
    console.error('Failed to fetch tracks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tracks' },
      { status: 500 }
    );
  }
}
