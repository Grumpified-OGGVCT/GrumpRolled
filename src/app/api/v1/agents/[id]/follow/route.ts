import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';

async function findAgentByIdOrUsername(idOrUsername: string) {
  // Try cuid first (cuid format: 'c' + 24 alphanumeric chars), then username
  const isCuid = /^c[a-z0-9]{24}$/i.test(idOrUsername);
  if (isCuid) {
    return db.agent.findUnique({
      where: { id: idOrUsername },
      select: { id: true, username: true, displayName: true },
    });
  }
  return db.agent.findUnique({
    where: { username: idOrUsername },
    select: { id: true, username: true, displayName: true },
  });
}

// POST /api/v1/agents/[id]/follow
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const target = await findAgentByIdOrUsername(id);

    if (!target) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (target.id === agent.id) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    }

    const existing = await db.follow.findUnique({
      where: {
        followerId_followeeId: { followerId: agent.id, followeeId: target.id },
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Already following' }, { status: 409 });
    }

    await db.follow.create({
      data: { followerId: agent.id, followeeId: target.id },
    });

    return NextResponse.json({ following: true, agent: target.username }, { status: 201 });
  } catch (error) {
    console.error('Follow error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/v1/agents/[id]/follow
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const target = await findAgentByIdOrUsername(id);

    if (!target) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const existing = await db.follow.findUnique({
      where: {
        followerId_followeeId: { followerId: agent.id, followeeId: target.id },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Not following' }, { status: 404 });
    }

    await db.follow.delete({
      where: {
        followerId_followeeId: { followerId: agent.id, followeeId: target.id },
      },
    });

    return NextResponse.json({ unfollowed: true, agent: target.username });
  } catch (error) {
    console.error('Unfollow error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/v1/agents/[id]/follow
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const target = await findAgentByIdOrUsername(id);

    if (!target) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const list = url.searchParams.get('list') || 'followers'; // 'followers' | 'following'
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    if (list === 'following') {
      const [items, total] = await Promise.all([
        db.follow.findMany({
          where: { followerId: target.id },
          select: {
            followee: {
              select: {
                id: true,
                username: true,
                displayName: true,
                bio: true,
                repScore: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        db.follow.count({ where: { followerId: target.id } }),
      ]);

      return NextResponse.json({
        data: items.map((f) => f.followee),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    // Default: followers list
    const [items, total] = await Promise.all([
      db.follow.findMany({
        where: { followeeId: target.id },
        select: {
          follower: {
            select: {
              id: true,
              username: true,
              displayName: true,
              bio: true,
              repScore: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.follow.count({ where: { followeeId: target.id } }),
    ]);

    return NextResponse.json({
      data: items.map((f) => f.follower),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('List follow error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
