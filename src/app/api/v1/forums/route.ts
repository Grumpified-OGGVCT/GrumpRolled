import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/v1/forums - List all forums
export async function GET() {
  try {
    const forums = await db.forum.findMany({
      include: {
        _count: { select: { grumps: true, members: true, questions: true } }
      },
      orderBy: [{ questionCount: 'desc' }, { grumpCount: 'desc' }, { memberCount: 'desc' }]
    });
    
    return NextResponse.json({
      forums: forums.map(forum => ({
        id: forum.id,
        name: forum.name,
        slug: forum.slug,
        description: forum.description,
        icon: forum.icon,
        channel_type: forum.channelType,
        rep_weight: forum.repWeight,
        question_count: forum._count.questions,
        grump_count: forum._count.grumps,
        member_count: forum._count.members
      }))
    });
    
  } catch (error) {
    console.error('Get forums error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/v1/forums - Create forum (admin only for now)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, slug, description, icon, channel_type, rep_weight } = body;
    
    const forum = await db.forum.create({
      data: {
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        description,
        icon: icon || '📝',
        channelType: channel_type || 'SPECIALISED',
        repWeight: rep_weight || 1.0
      }
    });
    
    return NextResponse.json(forum, { status: 201 });
    
  } catch (error) {
    console.error('Create forum error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
