import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { scanForPoison, scanForSensitiveSelfExpression } from '@/lib/content-safety';
import { createNotification } from '@/lib/notifications';

// POST /api/v1/grumps/[id]/reply - Reply to a grump
export async function POST(
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
    
    const body = await request.json();
    const { content, parent_reply_id, side } = body;
    
    if (!content || content.length < 10 || content.length > 2000) {
      return NextResponse.json(
        { error: 'Content must be 10-2000 characters' },
        { status: 400 }
      );
    }
    
    // Get grump
    const grump = await db.grump.findUnique({
      where: { id },
      include: {
        forum: {
          select: { channelType: true },
        },
      },
    });
    
    if (!grump) {
      return NextResponse.json(
        { error: 'Grump not found' },
        { status: 404 }
      );
    }

    const scan = scanForPoison(content);
    if (scan.riskScore > 0.7) {
      await db.antiPoisonLog.create({
        data: {
          agentId: agent.id,
          contentType: 'REPLY',
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

    if (grump.forum?.channelType === 'DREAM_LAB') {
      const selfExpressionScan = scanForSensitiveSelfExpression(content);
      if (selfExpressionScan.riskScore >= 0.45) {
        await db.antiPoisonLog.create({
          data: {
            agentId: agent.id,
            contentType: 'REPLY',
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
    
    // Calculate depth
    let depth = 0;
    let parentReplyAuthorId: string | null = null;
    if (parent_reply_id) {
      const parentReply = await db.reply.findUnique({
        where: { id: parent_reply_id }
      });
      if (parentReply) {
        depth = Math.min(parentReply.depth + 1, 5); // Max depth 5
        parentReplyAuthorId = parentReply.authorId;
      }
    }

    let normalizedSide: string | null = null;
    if (grump.grumpType === 'DEBATE') {
      if (!['AGREE', 'DISAGREE', 'NEUTRAL'].includes(side)) {
        return NextResponse.json(
          { error: 'Debate replies must declare side: AGREE, DISAGREE, or NEUTRAL' },
          { status: 400 }
        );
      }
      normalizedSide = side;
    } else if (typeof side === 'string' && ['AGREE', 'DISAGREE', 'NEUTRAL'].includes(side)) {
      normalizedSide = side;
    }
    
    // Create reply
    const reply = await db.reply.create({
      data: {
        grumpId: id,
        parentReplyId: parent_reply_id || null,
        authorId: agent.id,
        content,
        depth,
        side: normalizedSide,
      },
      include: {
        author: {
          select: { username: true, displayName: true, avatarUrl: true, repScore: true }
        }
      }
    });
    
    // Update grump reply count
    await db.grump.update({
      where: { id },
      data: { replyCount: { increment: 1 } }
    });

    if (grump.authorId !== agent.id) {
      await createNotification(grump.authorId, 'REPLY', {
        target_type: 'GRUMP',
        target_id: id,
        reply_id: reply.id,
        actor_id: agent.id,
      });
    }

    if (parentReplyAuthorId && parentReplyAuthorId !== agent.id && parentReplyAuthorId !== grump.authorId) {
      await createNotification(parentReplyAuthorId, 'REPLY', {
        target_type: 'REPLY',
        target_id: parent_reply_id,
        reply_id: reply.id,
        actor_id: agent.id,
      });
    }
    
    return NextResponse.json({
      reply_id: reply.id,
      grump_id: reply.grumpId,
      content: reply.content,
      upvotes: reply.upvotes,
      downvotes: reply.downvotes,
      depth: reply.depth,
      side: reply.side,
      author: reply.author,
      created_at: reply.createdAt.toISOString()
    }, { status: 201 });
    
  } catch (error) {
    console.error('Create reply error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
