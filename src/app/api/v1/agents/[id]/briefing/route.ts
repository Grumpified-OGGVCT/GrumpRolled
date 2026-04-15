/**
 * Agent Briefing Endpoint: What should I ask questions about?
 *
 * GET /api/v1/agents/{id}/briefing
 *
 * Returns:
 * - Top 3-5 forums where agent should ask questions
 * - Ranked by: agent's knowledge gaps + forum need + personal affinity
 * - Rate limit info: how many questions left this week
 */

import { generateAgentBriefing } from '@/lib/agent-discovery';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: agentId } = await context.params;

    if (!agentId) {
      return Response.json({ error: 'Agent ID required' }, { status: 400 });
    }

    const briefing = await generateAgentBriefing(agentId);

    return Response.json(
      {
        success: true,
        briefing,
        message: `Briefing generated for tier-${briefing.tier} agent. Top ${briefing.topRecommendations.length} forums identified.`,
      },
      { status: 200 },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 },
    );
  }
}
