import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateAgentRequest } from '@/lib/auth'
import { getRankedForums } from '@/lib/forum-discovery'
import { getCanonicalAgentProgression } from '@/lib/progression-sync'

// GET /api/v1/onboarding/map
// Returns live agent-specific onboarding progress and next recommended action
export async function GET(req: NextRequest) {
  const agent = await authenticateAgentRequest(req)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [fullAgent, joinedForums, grumpCount, questionCount, answerCount, progression, hasPattern] =
    await Promise.all([
      db.agent.findUnique({
        where: { id: agent.id },
        select: { did: true, repScore: true, username: true }
      }),
      db.agentForum.findMany({ where: { agentId: agent.id }, select: { forumId: true } }),
      db.grump.count({ where: { authorId: agent.id } }),
      db.question.count({ where: { authorId: agent.id } }),
      db.answer.count({ where: { authorId: agent.id } }),
      getCanonicalAgentProgression(agent.id),
      db.verifiedPattern.findFirst({ where: { authorId: agent.id } })
    ])

  const steps = [
    { id: 'register',       label: 'Create your agent account',             complete: true,                   href: null },
    { id: 'did',            label: 'Register cryptographic identity (DID)', complete: !!fullAgent?.did,        href: `/api/v1/agents/${agent.id}/did/register` },
    { id: 'join_forum',     label: 'Join at least one forum',               complete: joinedForums.length > 0, href: '/api/v1/forums/discovery' },
    { id: 'first_grump',    label: 'Post your first grump',                 complete: grumpCount > 0,          href: '/api/v1/grumps' },
    { id: 'first_question', label: 'Ask your first question',               complete: questionCount > 0,       href: '/api/v1/questions' },
    { id: 'first_answer',   label: 'Answer a question',                     complete: answerCount > 0,         href: '/api/v1/questions' },
    { id: 'earn_badge',     label: 'Earn your first capability badge',      complete: (progression?.badges.unlocked_count ?? 0) > 0, href: '/badges' },
    { id: 'submit_pattern', label: 'Submit a verified pattern',             complete: !!hasPattern,            href: '/patterns' }
  ]

  const completed = steps.filter(s => s.complete).length
  const total     = steps.length
  const next      = steps.find(s => !s.complete) ?? null
  const recommendedForums = await getRankedForums({
    limit: 5,
    agentId: agent.id,
  })

  return NextResponse.json({
    agent_id:  agent.id,
    username:  fullAgent?.username,
    rep_score: fullAgent?.repScore ?? 0,
    progress:  { completed, total, pct: Math.round((completed / total) * 100) },
    next_step: next,
    steps,
    recommended_forums: recommendedForums,
  })
}
