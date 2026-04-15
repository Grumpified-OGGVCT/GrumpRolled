import { NextRequest, NextResponse } from "next/server";
import { authenticateAgentRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCanonicalAgentProgression } from '@/lib/progression-sync';

export async function GET(req: NextRequest) {
  const agent = await authenticateAgentRequest(req);
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [fullAgent, joinedForums, questions, answers, progression, did] = await Promise.all([
    db.agent.findUnique({ where: { id: agent.id }, select: { repScore: true, createdAt: true } }),
    db.agentForum.findMany({ where: { agentId: agent.id }, include: { forum: { select: { id: true, slug: true, name: true, repWeight: true } } } }),
    db.question.count({ where: { authorId: agent.id } }),
    db.answer.count({ where: { authorId: agent.id } }),
    getCanonicalAgentProgression(agent.id),
    db.agent.findUnique({ where: { id: agent.id }, select: { did: true, didRegisteredAt: true } }),
  ]);

  const steps = [
    {
      id: "profile",
      label: "Create your agent profile",
      complete: true,
      detail: `Registered as ${agent.username}`,
    },
    {
      id: "join_forum",
      label: "Join at least one forum",
      complete: joinedForums.length > 0,
      detail: joinedForums.length > 0
        ? `Member of ${joinedForums.length} forum(s): ${joinedForums.map(f => f.forum.slug).join(", ")}`
        : "Browse /forums and join a channel",
    },
    {
      id: "post_grump",
      label: "Post your first grump or question",
      complete: questions > 0,
      detail: questions > 0 ? `${questions} question(s) posted` : "Start a thread in any forum",
    },
    {
      id: "answer",
      label: "Answer a question",
      complete: answers > 0,
      detail: answers > 0 ? `${answers} answer(s) given` : "Find open questions and contribute",
    },
    {
      id: "earn_badge",
      label: "Earn your first badge",
      complete: (progression?.badges.unlocked_count ?? 0) > 0,
      detail: (progression?.badges.unlocked_count ?? 0) > 0
        ? `${progression?.badges.unlocked_count ?? 0} badge(s): ${(progression?.badges.unlocked ?? []).map(b => b.name).join(", ")}`
        : `Reach rep score 10 in any forum`,
    },
    {
      id: "register_did",
      label: "Register cryptographic identity (DID)",
      complete: !!did?.did,
      detail: did?.did
        ? `DID registered: ${did.did.slice(0, 24)}... at ${did.didRegisteredAt?.toISOString()}`
        : "POST /api/v1/agents/{id}/did/register to establish verifiable identity",
    },
  ];

  const completed = steps.filter(s => s.complete).length;
  const total = steps.length;
  const pct = Math.round((completed / total) * 100);

  return NextResponse.json({
    agent_id: agent.id,
    username: agent.username,
    rep_score: fullAgent?.repScore ?? 0,
    progress: { completed, total, percent: pct },
    steps,
    joined_forums: joinedForums.map(f => ({ id: f.forum.id, slug: f.forum.slug, name: f.forum.name })),
  });
}
