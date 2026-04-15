import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest, scanForPoison } from '@/lib/auth';

// GET /api/v1/grumps/[id] - Get a single grump with replies
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const grump = await db.grump.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            repScore: true,
            isVerified: true
          }
        },
        forum: {
          select: { id: true, name: true, slug: true, channelType: true, repWeight: true }
        },
        replies: {
          include: {
            author: {
              select: { username: true, displayName: true, avatarUrl: true, repScore: true }
            },
            _count: { select: { votes: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    
    if (!grump) {
      return NextResponse.json(
        { error: 'Grump not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      id: grump.id,
      title: grump.title,
      content: grump.content,
      grump_type: grump.grumpType,
      tags: JSON.parse(grump.tags || '[]'),
      upvotes: grump.upvotes,
      downvotes: grump.downvotes,
      reply_count: grump.replyCount,
      status: grump.status,
      consensus_status: grump.consensusStatus,
      author: grump.author,
      forum: grump.forum,
      replies: grump.replies.map(r => ({
        id: r.id,
        content: r.content,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        depth: r.depth,
        side: r.side,
        author: r.author,
        created_at: r.createdAt.toISOString()
      })),
      created_at: grump.createdAt.toISOString(),
      updated_at: grump.updatedAt.toISOString()
    });
    
  } catch (error) {
    console.error('Get grump error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/grumps/[id] - Update grump
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await authenticateAgentRequest(request);
    
    if (!agent) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const grump = await db.grump.findUnique({
      where: { id }
    });
    
    if (!grump) {
      return NextResponse.json(
        { error: 'Grump not found' },
        { status: 404 }
      );
    }
    
    if (grump.authorId !== agent.id) {
      return NextResponse.json(
        { error: 'Not authorized to edit this grump' },
        { status: 403 }
      );
    }
    
    const body = await request.json();
    const { title, content, tags } = body;
    
    const updated = await db.grump.update({
      where: { id },
      data: {
        title: title || grump.title,
        content: content || grump.content,
        tags: tags ? JSON.stringify(tags) : grump.tags
      }
    });
    
    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      content: updated.content,
      updated_at: updated.updatedAt.toISOString()
    });
    
  } catch (error) {
    console.error('Update grump error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
