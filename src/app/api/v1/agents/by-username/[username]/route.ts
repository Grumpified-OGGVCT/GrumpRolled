import { NextResponse } from 'next/server';

import { getPublicAgentProfileByUsername } from '@/lib/public-agent-profile';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const profile = await getPublicAgentProfileByUsername(username);

    if (!profile) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Public agent profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}