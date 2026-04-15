import { NextRequest, NextResponse } from 'next/server';
import { answerWithTriplePass } from '@/lib/ollama-cloud';
import { selectBark, injectBark, GRUMPIFIED_SIGNATURE } from '@/lib/bark-engine';
import { routeRequest, getCostComparison } from '@/lib/llm-provider-router';

// POST /api/v1/llm/answer
/**
 * Enhanced LLM answer endpoint with optional bark injection
 *
 * Request body:
 *   {
 *     "question": string (required, ≥3 chars)
 *     "userId": string (optional, for bark tracking; if not provided, treated as anonymous)
 *     "no_bark": boolean (optional, default false; if true, return pure accuracy without personality injection)
 *   }
 *
 * Response includes the answer (with optional injected bark) + full triple-pass verification metadata.
 * If `no_bark=true`, returns accuracy-only response (useful for compliance-sensitive agents).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question = String(body.question || '').trim();
    const userId = String(body.userId || `anon-${Date.now()}`); // Default to session-based ID
    const noBark = Boolean(body.no_bark || false); // Respect -no_bark flag

    if (question.length < 3) {
      return NextResponse.json({ error: 'Question must be at least 3 characters.' }, { status: 400 });
    }

    // Get the factual answer from triple-pass verification (ALWAYS run, regardless of bark)
    const result = await answerWithTriplePass(question);

    // Conditional bark injection: skip if no_bark flag is set
    let finalAnswer = result.answer;
    let barkMetadata: { id: string; tag: string; mood: string; isGenerated: boolean } | null = null;

    if (!noBark) {
      // Select a fresh bark (topic-aware, never-repeating within 24h)
      const bark = await selectBark(userId, question);

      // Inject the bark into the answer (random prefix/suffix placement)
      const answerWithBark = injectBark(result.answer, bark, 'random');

      // Append the GrumpRolled signature
      finalAnswer = answerWithBark + GRUMPIFIED_SIGNATURE;

      barkMetadata = {
        id: bark.id,
        tag: bark.tag,
        mood: bark.mood,
        isGenerated: bark.isGenerated,
      };
    }

    const catalogRoute = routeRequest('reasoning');

    return NextResponse.json({
      question,
      answer: finalAnswer,
      bark_enabled: !noBark,
      // Include bark metadata only if bark was injected
      ...(barkMetadata && {
        bark: barkMetadata,
      }),
      // Preserve the original triple-pass metrics (ALWAYS included, with or without bark)
      confidence: result.confidence,
      verification_summary: result.verification,
      models: {
        primary: {
          name: result.modelPrimary,
          why: result.modelPrimaryReason,
          transparency: result.primaryTransparency,
        },
        verifier: {
          name: result.modelVerifier,
          why: result.modelVerifierReason,
          transparency: result.verifierTransparency,
        },
        selection_summary: result.selectionSummary,
      },
      used_web_search: result.usedWebSearch,
      citations: result.citations,
      context_budget: {
        max_chars: result.contextBudgetChars,
        used_chars: result.contextUsedChars,
        sources_used: result.contextSourcesUsed,
        note: `This budget applies only to freshness retrieval packing, not to anchor or consistency context.`,
      },
      evidence_context: {
        knowledge_anchors_used: result.knowledgeAnchorsUsed,
        knowledge_anchor_chars: result.contextTelemetry.anchorChars,
        consistency_hints_used: result.contextTelemetry.consistencyHintsUsed,
        consistency_hint_chars: result.contextTelemetry.consistencyHintChars,
        total_context_chars: result.contextTelemetry.totalContextChars,
        total_source_blocks: result.contextTelemetry.totalSourceBlocks,
        compression_applied: result.contextTelemetry.compressionApplied,
        compression_reasons: result.contextTelemetry.compressionReasons,
        note: 'Evidence context includes verified anchors, optional consistency hints, and freshness retrieval when used.',
      },
      degraded_state: {
        degraded: result.degradedState.degraded,
        reasons: result.degradedState.reasons,
        primary_route_failed: result.degradedState.primaryRouteFailed,
        verifier_route_failed: result.degradedState.verifierRouteFailed,
        freshness_recovery_failed: result.degradedState.freshnessRecoveryFailed,
        verifier_reused_primary_model: result.degradedState.verifierReusedPrimaryModel,
      },
      consistency: {
        key: result.consistencyKey,
        cache_hit: result.consistencyCacheHit,
        knowledge_anchors_used: result.knowledgeAnchorsUsed,
        note: 'Answers are softly aligned to verified knowledge anchors and recent canonical responses for similar prompts.',
      },
      quality_gate: {
        triple_pass: true,
        bark_injected: Boolean(barkMetadata),
        status: result.confidence >= 0.7 ? 'pass' : 'review',
      },
      // Cost optimization info for transparency
      cost_info: {
        provider_route: result.primaryTransparency.provider_name,
        provider_model: result.primaryTransparency.model_id,
        provider_role: result.primaryTransparency.role,
        route_catalog_recommendation: {
          provider: catalogRoute.provider.name,
          model: catalogRoute.model.id,
          reason: catalogRoute.selectionReason,
        },
        monthly_savings_vs_ollama_cloud: getCostComparison().savingsPercent,
        reference: 'See /docs/COST_OPTIMIZED_LLM_SETUP.md for provider strategy',
      },
    });
  } catch (error) {
    console.error('LLM answer error:', error);
    return NextResponse.json(
      {
        error: 'LLM answer pipeline failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
