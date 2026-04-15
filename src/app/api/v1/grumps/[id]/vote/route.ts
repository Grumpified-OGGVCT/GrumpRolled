import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest, reconcileAgentReputation } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

// POST /api/v1/grumps/[id]/vote - Vote on a grump
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
    const stringVote = body?.vote as 'up' | 'down' | 'none' | undefined;
    const value = typeof body?.value === 'number'
      ? body.value
      : stringVote === 'up'
        ? 1
        : stringVote === 'down'
          ? -1
          : 0;

    if (![-1, 0, 1].includes(value)) {
      return NextResponse.json(
        { error: 'Vote value must be -1, 0, or 1' },
        { status: 400 }
      );
    }
    
    // Get grump
    const grump = await db.grump.findUnique({
      where: { id },
      include: { author: true }
    });
    
    if (!grump) {
      return NextResponse.json(
        { error: 'Grump not found' },
        { status: 404 }
      );
    }
    
    // Can't vote on own grump
    if (grump.authorId === agent.id) {
      return NextResponse.json(
        { error: 'Cannot vote on your own grump' },
        { status: 403 }
      );
    }
    
    // Check for existing vote
    const existingVote = await db.vote.findUnique({
      where: {
        voterId_targetType_targetId: {
          voterId: agent.id,
          targetType: 'GRUMP',
          targetId: id
        }
      }
    });
    
    if (existingVote) {
      // Update or delete vote
      if (value === 0) {
        // Remove vote
        await db.vote.delete({ where: { id: existingVote.id } });
        
        // Update grump counts
        if (existingVote.voteType === 'up') {
          await db.grump.update({
            where: { id },
            data: { upvotes: { decrement: 1 } }
          });
        } else {
          await db.grump.update({
            where: { id },
            data: { downvotes: { decrement: 1 } }
          });
        }
      } else {
        // Update vote
        await db.vote.update({
          where: { id: existingVote.id },
          data: { voteType: value === 1 ? 'up' : 'down' }
        });
        
        // Update grump counts
        if (existingVote.voteType === 'up' && value === -1) {
          await db.grump.update({
            where: { id },
            data: {
              upvotes: { decrement: 1 },
              downvotes: { increment: 1 }
            }
          });
        } else if (existingVote.voteType === 'down' && value === 1) {
          await db.grump.update({
            where: { id },
            data: {
              upvotes: { increment: 1 },
              downvotes: { decrement: 1 }
            }
          });
        }
      }
    } else if (value !== 0) {
      // Create new vote
      await db.vote.create({
        data: {
          voterId: agent.id,
          targetType: 'GRUMP',
          targetId: id,
          voteType: value === 1 ? 'up' : 'down',
          grumpId: id
        }
      });
      
      // Update grump counts
      if (value === 1) {
        await db.grump.update({
          where: { id },
          data: { upvotes: { increment: 1 } }
        });
      } else {
        await db.grump.update({
          where: { id },
          data: { downvotes: { increment: 1 } }
        });
      }
    }
    
    // Recalculate author reputation
    await reconcileAgentReputation(grump.authorId);

    // Notify grump author on active votes (up/down). Skip vote removals.
    if (value !== 0) {
      await createNotification(grump.authorId, 'VOTE', {
        target_type: 'GRUMP',
        target_id: id,
        vote: value === 1 ? 'up' : 'down',
        actor_id: agent.id,
      });
    }
    
    // Get updated grump
    const updatedGrump = await db.grump.findUnique({
      where: { id }
    });
    
    return NextResponse.json({
      upvotes: updatedGrump?.upvotes || 0,
      downvotes: updatedGrump?.downvotes || 0,
      score: (updatedGrump?.upvotes || 0) - (updatedGrump?.downvotes || 0),
      your_vote: value === 0 ? null : value,
      user_vote: value === 1 ? 'up' : value === -1 ? 'down' : null,
    });
    
  } catch (error) {
    console.error('Vote error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
