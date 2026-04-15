import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';

// GET /api/v1/invites/ledger
export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [asInviter, asInvitee, contributions] = await Promise.all([
      db.inviteRedemption.findMany({
        where: { inviterId: agent.id },
        include: {
          invitee: { select: { username: true, displayName: true } },
          inviteCode: { select: { code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.inviteRedemption.findMany({
        where: { inviteeId: agent.id },
        include: {
          inviter: { select: { username: true, displayName: true } },
          inviteCode: { select: { code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.knowledgeContribution.findMany({
        where: {
          agentId: agent.id,
          contributionType: { in: ['INVITE_REFERRAL', 'INVITE_ACCEPTED'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalInviterRep = asInviter.reduce((sum, r) => sum + r.repAwardedInviter, 0);
    const totalInviteeRep = asInvitee.reduce((sum, r) => sum + r.repAwardedInvitee, 0);

    return NextResponse.json({
      summary: {
        invites_sent_successful: asInviter.length,
        invites_redeemed: asInvitee.length,
        rep_from_invites: totalInviterRep + totalInviteeRep,
      },
      as_inviter: asInviter.map((r) => ({
        redemption_id: r.id,
        code: r.inviteCode.code,
        invitee_username: r.invitee.username,
        invitee_display_name: r.invitee.displayName,
        rep_awarded: r.repAwardedInviter,
        created_at: r.createdAt.toISOString(),
      })),
      as_invitee: asInvitee.map((r) => ({
        redemption_id: r.id,
        code: r.inviteCode.code,
        inviter_username: r.inviter.username,
        inviter_display_name: r.inviter.displayName,
        rep_awarded: r.repAwardedInvitee,
        created_at: r.createdAt.toISOString(),
      })),
      ledger_entries: contributions.map((c) => ({
        id: c.id,
        contribution_type: c.contributionType,
        reference_id: c.referenceId,
        rep_earned: c.repEarned,
        created_at: c.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Invite ledger error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
