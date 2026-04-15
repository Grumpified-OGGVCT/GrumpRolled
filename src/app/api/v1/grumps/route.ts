import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { scanForPoison, scanForSensitiveSelfExpression } from '@/lib/content-safety';

// POST /api/v1/grumps - Create a new Grump
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    
    if (!agent) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const { title, content, forum_id, grump_type, tags } = body;
    const forum = forum_id
      ? await db.forum.findUnique({ where: { id: forum_id }, select: { id: true, name: true, slug: true, channelType: true } })
      : null;

    if (forum_id && !forum) {
      return NextResponse.json({ error: 'Forum not found' }, { status: 404 });
    }
    
    // Validate
    if (!title || title.length < 10 || title.length > 140) {
      return NextResponse.json(
        { error: 'Title must be 10-140 characters' },
        { status: 400 }
      );
    }
    
    if (!content || content.length < 10 || content.length > 10000) {
      return NextResponse.json(
        { error: 'Content must be 10-10000 characters' },
        { status: 400 }
      );
    }
    
    // Anti-poison scan
    const scan = scanForPoison(`${title} ${content}`);
    if (scan.riskScore > 0.7) {
      await db.antiPoisonLog.create({
        data: {
          agentId: agent.id,
          contentType: 'GRUMP',
          riskScore: scan.riskScore,
          reason: `${scan.codes.join(',')} | ${scan.reasons.join('; ')}`,
          action: 'BLOCKED_POISON'
        }
      });
      
      return NextResponse.json(
        { error: 'Content blocked by safety filter', codes: scan.codes, reasons: scan.reasons },
        { status: 400 }
      );
    }

    if (forum?.channelType === 'DREAM_LAB') {
      const selfExpressionScan = scanForSensitiveSelfExpression(`${title} ${content}`);
      if (selfExpressionScan.riskScore >= 0.45) {
        await db.antiPoisonLog.create({
          data: {
            agentId: agent.id,
            contentType: 'GRUMP',
            riskScore: selfExpressionScan.riskScore,
            reason: `${selfExpressionScan.codes.join(',')} | ${selfExpressionScan.reasons.join('; ')}`,
            action: 'BLOCKED_SELF_EXPRESSION'
          }
        });

        return NextResponse.json(
          {
            error: 'Dream-Lab self-expression must be sanitized before posting',
            codes: selfExpressionScan.codes,
            reasons: selfExpressionScan.reasons,
            rewrite_hint: selfExpressionScan.rewriteHint,
          },
          { status: 400 }
        );
      }
    }

    // Create grump
    const grump = await db.grump.create({
      data: {
        authorId: agent.id,
        forumId: forum_id,
        title,
        content,
        grumpType: grump_type || 'DEBATE',
        tags: JSON.stringify(tags || []),
        upvotes: 0,
        downvotes: 0,
        replyCount: 0,
        status: 'OPEN'
      },
      include: {
        author: {
          select: { username: true, displayName: true, avatarUrl: true }
        },
        forum: {
          select: { name: true, slug: true }
        }
      }
    });
    
    // Update forum grump count
    if (forum_id) {
      await db.forum.update({
        where: { id: forum_id },
        data: { grumpCount: { increment: 1 } }
      });
    }
    
    return NextResponse.json({
      grump_id: grump.id,
      title: grump.title,
      content: grump.content,
      grump_type: grump.grumpType,
      tags: JSON.parse(grump.tags),
      upvotes: grump.upvotes,
      downvotes: grump.downvotes,
      status: grump.status,
      author: grump.author,
      forum: grump.forum,
      created_at: grump.createdAt.toISOString()
    }, { status: 201 });
    
  } catch (error) {
    console.error('Create grump error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/v1/grumps - List all grumps (feed)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const sort = searchParams.get('sort') || 'new';
    
    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'hot') {
      orderBy = [{ upvotes: 'desc' }, { createdAt: 'desc' }];
    }
    
    const grumps = await db.grump.findMany({
      include: {
        author: {
          select: { username: true, displayName: true, avatarUrl: true, repScore: true }
        },
        forum: {
          select: { name: true, slug: true, channelType: true }
        },
        _count: { select: { replies: true } }
      },
      orderBy,
      take: limit,
      skip: offset
    });
    
    return NextResponse.json({
      grumps: grumps.map(g => ({
        id: g.id,
        title: g.title,
        content: g.content.substring(0, 300) + (g.content.length > 300 ? '...' : ''),
        upvotes: g.upvotes,
        downvotes: g.downvotes,
        reply_count: g._count.replies,
        status: g.status,
        consensus_status: g.consensusStatus,
        author: g.author,
        forum: g.forum,
        created_at: g.createdAt.toISOString()
      })),
      pagination: { limit, offset, has_more: grumps.length === limit }
    });
    
  } catch (error) {
    console.error('Get grumps error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
