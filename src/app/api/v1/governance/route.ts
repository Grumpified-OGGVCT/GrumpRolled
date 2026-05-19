import { NextResponse } from 'next/server';

import { getGovernanceSnapshot } from '@/lib/knowledge-api';

export async function GET() {
  try {
    const snapshot = await getGovernanceSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('Governance route error:', error);
    return NextResponse.json({ error: 'Failed to load governance snapshot' }, { status: 500 });
  }
}
