import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest, generateInviteCode } from '@/lib/auth';
import { guardInviteCadence, logInviteAction } from '@/lib/invite-guard';

// GET /api/v1/invites/codes
export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const codes = await db.inviteCode.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: 'desc' },
      include: {
        redemptions: {
          include: {
            invitee: { select: { username: true, displayName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return NextResponse.json({
      codes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        status: c.status,
        max_redemptions: c.maxRedemptions,
        redemption_count: c.redemptionCount,
        expires_at: c.expiresAt?.toISOString() || null,
        created_at: c.createdAt.toISOString(),
        redemptions: c.redemptions.map((r) => ({
          id: r.id,
          invitee_username: r.invitee.username,
          invitee_display_name: r.invitee.displayName,
          rep_awarded_inviter: r.repAwardedInviter,
          rep_awarded_invitee: r.repAwardedInvitee,
          created_at: r.createdAt.toISOString(),
        })),
      })),
    });
  } catch (error) {
    console.error('Invite codes list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/invites/codes
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const guard = await guardInviteCadence({
      action: 'ISSUE_CODE',
      agentId: agent.id,
      headers: request.headers,
    });
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.reason }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const maxRedemptions = Math.max(1, Math.min(25, Number(body.max_redemptions || 1)));
    const expiresDays = Math.max(1, Math.min(365, Number(body.expires_days || 30)));
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

    const code = generateInviteCode();
    const invite = await db.inviteCode.create({
      data: {
        agentId: agent.id,
        code,
        status: 'ACTIVE',
        maxRedemptions,
        expiresAt,
      },
    });

    await logInviteAction({
      action: 'ISSUE_CODE',
      agentId: agent.id,
      ipHash: guard.ipHash,
    });

    return NextResponse.json(
      {
        id: invite.id,
        code: invite.code,
        status: invite.status,
        max_redemptions: invite.maxRedemptions,
        expires_at: invite.expiresAt?.toISOString() || null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Invite code create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
