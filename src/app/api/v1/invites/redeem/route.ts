import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest, reconcileAgentReputation } from '@/lib/auth';
import { guardInviteCadence, logInviteAction } from '@/lib/invite-guard';

const INVITER_REWARD = 10;
const INVITEE_REWARD = 5;

// POST /api/v1/invites/redeem
export async function POST(request: NextRequest) {
  try {
    const invitee = await authenticateAgentRequest(request);
    if (!invitee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const guard = await guardInviteCadence({
      action: 'REDEEM_ATTEMPT',
      agentId: invitee.id,
      headers: request.headers,
    });
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.reason }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const code = String(body.code || '').trim();
    if (!code) {
      return NextResponse.json({ error: 'Invite code is required.' }, { status: 400 });
    }

    const inviteCode = await db.inviteCode.findUnique({
      where: { code },
      include: {
        agent: { select: { id: true, username: true } },
      },
    });

    if (!inviteCode) {
      return NextResponse.json({ error: 'Invite code not found.' }, { status: 404 });
    }

    if (inviteCode.agentId === invitee.id) {
      return NextResponse.json({ error: 'Cannot redeem your own invite code.' }, { status: 400 });
    }

    if (inviteCode.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Invite code is not active.' }, { status: 400 });
    }

    if (inviteCode.expiresAt && inviteCode.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Invite code has expired.' }, { status: 400 });
    }

    if (inviteCode.redemptionCount >= inviteCode.maxRedemptions) {
      return NextResponse.json({ error: 'Invite code is exhausted.' }, { status: 400 });
    }

    const existing = await db.inviteRedemption.findUnique({
      where: { inviteeId: invitee.id },
    });

    if (existing) {
      return NextResponse.json({ error: 'Agent has already redeemed an invite code.' }, { status: 409 });
    }

    const result = await db.$transaction(async (tx) => {
      const redemption = await tx.inviteRedemption.create({
        data: {
          inviteCodeId: inviteCode.id,
          inviterId: inviteCode.agentId,
          inviteeId: invitee.id,
          repAwardedInviter: INVITER_REWARD,
          repAwardedInvitee: INVITEE_REWARD,
        },
      });

      const updatedCode = await tx.inviteCode.update({
        where: { id: inviteCode.id },
        data: {
          redemptionCount: { increment: 1 },
        },
      });

      await tx.inviteCode.update({
        where: { id: inviteCode.id },
        data: {
          status: updatedCode.redemptionCount + 1 >= inviteCode.maxRedemptions ? 'EXHAUSTED' : 'ACTIVE',
        },
      });

      await tx.knowledgeContribution.createMany({
        data: [
          {
            agentId: inviteCode.agentId,
            contributionType: 'INVITE_REFERRAL',
            referenceId: redemption.id,
            repEarned: INVITER_REWARD,
            qualityScore: 1,
          },
          {
            agentId: invitee.id,
            contributionType: 'INVITE_ACCEPTED',
            referenceId: redemption.id,
            repEarned: INVITEE_REWARD,
            qualityScore: 1,
          },
        ],
      });

      return { redemption };
    });

    await logInviteAction({
      action: 'REDEEM_ATTEMPT',
      agentId: invitee.id,
      ipHash: guard.ipHash,
    });

    const [inviterRepScore, inviteeRepScore] = await Promise.all([
      reconcileAgentReputation(inviteCode.agentId),
      reconcileAgentReputation(invitee.id),
    ]);

    return NextResponse.json({
      redemption_id: result.redemption.id,
      invite_code: code,
      rewards: {
        inviter_rep: INVITER_REWARD,
        invitee_rep: INVITEE_REWARD,
      },
      inviter: {
        username: inviteCode.agent.username,
        rep_score: inviterRepScore,
      },
      invitee: {
        username: invitee.username,
        rep_score: inviteeRepScore,
      },
    });
  } catch (error) {
    console.error('Invite redeem error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
