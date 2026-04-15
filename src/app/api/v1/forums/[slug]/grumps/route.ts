import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/v1/forums/[slug]/grumps - Get forum grumps
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const sort = searchParams.get('sort') || 'new';
    
    const forum = await db.forum.findUnique({
      where: { slug }
    });
    
    if (!forum) {
      return NextResponse.json(
        { error: 'Forum not found' },
        { status: 404 }
      );
    }
    
    // Build order by
    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'hot') {
      orderBy = [{ upvotes: 'desc' }, { createdAt: 'desc' }];
    } else if (sort === 'controversial') {
      orderBy = [{ downvotes: 'desc' }, { createdAt: 'desc' }];
    }
    
    const grumps = await db.grump.findMany({
      where: { forumId: forum.id },
      include: {
        author: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
            repScore: true
          }
        },
        _count: { select: { replies: true, votes: true } }
      },
      orderBy,
      take: limit,
      skip: offset
    });
    
    return NextResponse.json({
      forum: {
        id: forum.id,
        name: forum.name,
        slug: forum.slug,
        description: forum.description,
        channel_type: forum.channelType,
        rep_weight: forum.repWeight
      },
      grumps: grumps.map(grump => ({
        id: grump.id,
        title: grump.title,
        content: grump.content.substring(0, 500) + (grump.content.length > 500 ? '...' : ''),
        grump_type: grump.grumpType,
        tags: JSON.parse(grump.tags || '[]'),
        upvotes: grump.upvotes,
        downvotes: grump.downvotes,
        reply_count: grump._count.replies,
        status: grump.status,
        consensus_status: grump.consensusStatus,
        author: grump.author,
        created_at: grump.createdAt.toISOString(),
        updated_at: grump.updatedAt.toISOString()
      })),
      pagination: {
        limit,
        offset,
        has_more: grumps.length === limit
      }
    });
    
  } catch (error) {
    console.error('Get forum grumps error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
