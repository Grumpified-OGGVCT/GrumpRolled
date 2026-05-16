import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { checkContributionGate, ForgeRole } from '@/lib/forge-gates';

// GET /api/v1/forge/proposals/[slug]/check-gate?slice_index=0&role=CONTRIBUTOR
// Proactively checks trust gate eligibility without attempting to claim.
// Returns structured gate info so the UI can show eligibility badges.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const { searchParams } = new URL(request.url);

    const project = await db.forgeProject.findUnique({ where: { slug } });
    if (!project) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (project.status !== 'CONTRIBUTION') {
      return NextResponse.json(
        { error: `Gate checks only available during CONTRIBUTION (current: ${project.status})` },
        { status: 400 }
      );
    }

    const slices: Array<{ index: number; status: string; title: string; description: string; role: string }> =
      project.slices ? JSON.parse(project.slices) : [];

    const sliceIndicesParam = searchParams.get('slice_indices');
    const indices = sliceIndicesParam
      ? sliceIndicesParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
      : slices.filter((s) => s.status === 'OPEN').map((s) => s.index);

    const results = await Promise.all(
      indices.map(async (idx) => {
        const slice = slices.find((s) => s.index === idx);
        if (!slice) return { slice_index: idx, error: 'Slice not found' };
        if (slice.status !== 'OPEN') return { slice_index: idx, eligible: false, reason: `Slice is ${slice.status}`, role_required: slice.role };

        const role = (searchParams.get('role') || slice.role || 'CONTRIBUTOR').toUpperCase() as ForgeRole;
        const existing = await db.forgeContribution.findUnique({
          where: { agentId_projectId_sliceIndex: { agentId: agent.id, projectId: project.id, sliceIndex: idx } },
        });

        if (existing) return { slice_index: idx, eligible: false, reason: 'Already opted in', role_required: slice.role };

        const gate = await checkContributionGate(agent.id, project.category, role);
        return {
          slice_index: idx,
          eligible: gate.passed,
          role_required: slice.role,
          reason: gate.passed ? null : gate.reason,
          details: gate.details || null,
        };
      })
    );

    return NextResponse.json({
      proposal_slug: slug,
      category: project.category,
      results,
    });
  } catch (error) {
    console.error('Check gate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
