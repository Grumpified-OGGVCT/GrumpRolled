/**
 * Cost Transparency Endpoint
 * GET /api/v1/cost-info
 * 
 * Returns:
 * - Current cost comparison (Ollama vs multi-provider hybrid)
 * - Provider allocation percentages
 * - Monthly savings estimate
 * - Setup instructions link
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  PROVIDER_CONFIGS, 
  getCostComparison, 
  getProviderInventory,
  getPricingMatrix,
  routeRequest 
} from '@/lib/llm-provider-router';

export async function GET(request: NextRequest) {
  try {
    const costs = getCostComparison();
    const inventory = getProviderInventory();
    const providers = Object.entries(PROVIDER_CONFIGS).map(([key, config]) => ({
      provider_id: key,
      name: config.name,
      allocation: config.allocationPercent,
      costPerMInput: config.pricePerMInput,
      costPerMOutput: config.pricePerMOutput,
      contextWindow: config.contextWindow,
      quality: config.quality,
      recommended: config.recommended,
    }));

    // Estimate for different usage levels
    const lightUsage = getPricingMatrix(10_000_000, 10_000_000);
    const mediumUsage = getPricingMatrix(50_000_000, 50_000_000);
    const heavyUsage = getPricingMatrix(200_000_000, 200_000_000);
    const configuredProviders = inventory.filter((entry) => entry.configured);
    const fallbackCascade = providers
      .filter((provider) => provider.recommended || provider.allocation > 0)
      .sort((left, right) => right.allocation - left.allocation)
      .map((provider) => provider.name);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      mission: 'Replace Ollama Cloud ($80/month) with cost-optimized multi-provider strategy',
      current_situation: {
        ollama_cloud_monthly: costs.ollama,
        recommended_hybrid_monthly: costs.hybrid,
        deepseek_only_monthly: costs.deepseek,
        monthly_savings: costs.ollama - costs.hybrid,
        savings_percent: costs.savingsPercent,
      },
      provider_strategy: {
        allocation: providers,
        fallback_cascade: fallbackCascade,
        routed_provider_count: inventory.length,
        configured_provider_count: configuredProviders.length,
      },
      pricing_by_usage_level: {
        light_usage: {
          tokens_per_month: '20M (10M input + 10M output)',
          costs: lightUsage,
        },
        medium_usage: {
          tokens_per_month: '100M (50M input + 50M output)',
          costs: mediumUsage,
        },
        heavy_usage: {
          tokens_per_month: '200M (100M input + 100M output)',
          costs: heavyUsage,
        },
      },
      current_routing: {
        reasoning_task: routeRequest('reasoning').provider.name,
        fast_polling_task: routeRequest('fast-polling').provider.name,
        cost_optimized_task: routeRequest('cost-optimized').provider.name,
        long_context_task: routeRequest('long-context').provider.name,
      },
      action_items: [
        '1. Review approved routed provider inventory through the admin inventory surface',
        '2. Configure only approved provider keys using the repo-supported env names',
        '3. Run health check: curl /api/v1/provider-health',
        '4. Verify reasoning, fast-polling, cost-optimized, and long-context routes',
        '5. Monitor costs monthly',
      ],
      setup_docs: '/docs/COST_OPTIMIZED_LLM_SETUP.md',
      copilot_pro: {
        status: 'Keep active',
        monthly_cost: 20,
        reason: 'IDE integration, Copilot Chat in VS Code',
      },
      total_monthly_spend: {
        old: `Ollama Cloud: $${costs.ollama}`,
        new: `Hybrid routed providers: $${costs.hybrid}`,
        plus_copilot_pro: `$${costs.hybrid} + $20 (Copilot Pro) = $${costs.hybrid + 20}`,
        net_savings: `$${80 + 20 - (costs.hybrid + 20)} vs old Ollama + Copilot Pro`,
      },
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      }
    });
  } catch (error) {
    console.error('Cost info endpoint error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      reference: '/docs/COST_OPTIMIZED_LLM_SETUP.md',
    }, { status: 500 });
  }
}
