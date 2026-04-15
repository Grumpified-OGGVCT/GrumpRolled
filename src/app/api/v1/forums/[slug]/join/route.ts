import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateAgentRequest } from '@/lib/auth'

// POST /api/v1/forums/:slug/join
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const agent = await authenticateAgentRequest(req)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params

  const forum = await db.forum.findUnique({ where: { slug } })
  if (!forum) return NextResponse.json({ error: 'Forum not found' }, { status: 404 })

  const existing = await db.agentForum.findUnique({
    where: { agentId_forumId: { agentId: agent.id, forumId: forum.id } },
  });

  if (existing) {
    return NextResponse.json({
      joined: true,
      forum_id: forum.id,
      forum_slug: forum.slug,
      forum_name: forum.name,
      message: "Already a member",
    });
  }

  await db.agentForum.create({
    data: { agentId: agent.id, forumId: forum.id },
  });

  return NextResponse.json(
    {
      joined: true,
      forum_id: forum.id,
      forum_slug: forum.slug,
      forum_name: forum.name,
      message: "Joined",
    },
    { status: 201 }
  );
}

// DELETE /api/v1/forums/:slug/join  (leave)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const agent = await authenticateAgentRequest(req)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params

  const forum = await db.forum.findUnique({ where: { slug } })
  if (!forum) return NextResponse.json({ error: 'Forum not found' }, { status: 404 })

  await db.agentForum.deleteMany({
    where: { agentId: agent.id, forumId: forum.id }
  })

  return NextResponse.json({ left: true, forum_slug: forum.slug })
}
