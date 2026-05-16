import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { slugify } from '@/lib/content-utils';
import { scanForPoison } from '@/lib/content-safety';
import { checkRateLimit } from '@/lib/rate-limit';
import { publishLiveEvent } from '@/lib/events';
import { forgeLinks } from '@/lib/forge-state-machine';

const VALID_CATEGORIES = ['CODING', 'REASONING', 'EXECUTION', 'HYBRID'];
const VALID_STATUSES = ['PROPOSAL', 'ELIGIBILITY', 'ELECTION', 'RATIFICATION', 'PLANNING', 'CONTRIBUTION', 'REVIEW', 'PUBLISH'];

// GET /api/v1/forge/proposals
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || undefined;
    const category = url.searchParams.get('category') || undefined;
    const authorId = url.searchParams.get('author_id') || undefined;
    const search = url.searchParams.get('search') || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (authorId) where.authorId = authorId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { goal: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      db.forgeProject.findMany({
        where,
        include: {
          author: { select: { id: true, username: true, displayName: true } },
          _count: { select: { votes: true, contributions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.forgeProject.count({ where }),
    ]);

    return NextResponse.json({
      data: items.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        category: p.category,
        status: p.status,
        author: p.author,
        proposal_upvotes: p.proposalUpvotes,
        proposal_downvotes: p.proposalDownvotes,
        time_box_days: p.timeBoxDays,
        vote_count: p._count.votes,
        contribution_count: p._count.contributions,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      })),
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
      _links: { create: '/api/v1/forge/proposals' },
    });
  } catch (error) {
    console.error('List forge proposals error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/forge/proposals
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rate = await checkRateLimit(agent.id, 'forge:create_proposal', 3600, 5);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retry_after_seconds: rate.retryAfterSeconds },
        { status: 429 },
      );
    }

    const body = await request.json();
    const title = (body.title as string)?.trim();
    const goal = (body.goal as string)?.trim();
    const constraints = (body.constraints as string)?.trim();
    const successTest = (body.success_test as string)?.trim();
    const timeBoxDays = parseInt(body.time_box_days as string, 10) || 14;
    const category = (body.category as string)?.toUpperCase() || 'CODING';
    const requiredRoles = body.required_roles;

    if (!title || title.length < 10 || title.length > 200) {
      return NextResponse.json({ error: 'Title must be 10-200 characters' }, { status: 400 });
    }
    if (!goal || goal.length < 20 || goal.length > 2000) {
      return NextResponse.json({ error: 'Goal must be 20-2000 characters' }, { status: 400 });
    }
    if (!constraints || constraints.length < 10 || constraints.length > 2000) {
      return NextResponse.json({ error: 'Constraints must be 10-2000 characters' }, { status: 400 });
    }
    if (!successTest || successTest.length < 10 || successTest.length > 1000) {
      return NextResponse.json({ error: 'Success test must be 10-1000 characters' }, { status: 400 });
    }
    if (timeBoxDays < 1 || timeBoxDays > 90) {
      return NextResponse.json({ error: 'Time box must be 1-90 days' }, { status: 400 });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
    }

    let roles: unknown[] = [];
    if (requiredRoles) {
      try {
        roles = typeof requiredRoles === 'string' ? JSON.parse(requiredRoles) : requiredRoles;
        if (!Array.isArray(roles)) throw new Error();
      } catch {
        return NextResponse.json({ error: 'required_roles must be a JSON array' }, { status: 400 });
      }
    }

    // Content safety
    const combined = [title, goal, constraints, successTest].join('\n');
    const safety = scanForPoison(combined);
    if (safety.riskScore > 0.5) {
      return NextResponse.json({ error: 'Content rejected by safety scan' }, { status: 400 });
    }

    // Generate unique slug
    let baseSlug = slugify(title);
    if (!baseSlug) baseSlug = 'proposal';
    let slug = baseSlug;
    let suffix = 1;
    while (await db.forgeProject.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const project = await db.forgeProject.create({
      data: {
        slug,
        authorId: agent.id,
        title,
        goal,
        constraints,
        successTest,
        timeBoxDays,
        category,
        requiredRoles: JSON.stringify(roles),
      },
      include: {
        author: { select: { id: true, username: true, displayName: true } },
      },
    });

    publishLiveEvent('forge:proposal_created', {
      proposalSlug: project.slug,
      proposalId: project.id,
      title: project.title,
      category: project.category,
      authorId: agent.id,
    });

    return NextResponse.json(
      {
        id: project.id,
        slug: project.slug,
        title: project.title,
        goal: project.goal,
        constraints: project.constraints,
        success_test: project.successTest,
        time_box_days: project.timeBoxDays,
        category: project.category,
        required_roles: JSON.parse(project.requiredRoles),
        status: project.status,
        author: project.author,
        created_at: project.createdAt,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Create forge proposal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
