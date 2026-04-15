/**
 * Provider Health Check Endpoint
 * GET /api/v1/provider-health
 * 
 * Tests connectivity to all LLM providers in the multi-provider strategy.
 * Returns latency and online status for each.
 */

import { NextRequest, NextResponse } from 'next/server';
import { healthCheckProviders, PROVIDER_CONFIGS } from '@/lib/llm-provider-router';

export async function GET(request: NextRequest) {
  try {
    const health = await healthCheckProviders();

    // Enhance with provider metadata
    const results = Object.entries(health).map(([key, status]) => {
      const config = PROVIDER_CONFIGS[key];
      return {
        provider: key,
        name: config?.name || 'Unknown',
        status: status.online ? 'online' : 'offline',
        latency_ms: status.latencyMs,
        error: status.error,
        allocation_percent: config?.allocationPercent || 0,
        recommended: config?.recommended || false,
      };
    });

    // Summary
    const onlineCount = results.filter(r => r.status === 'online').length;
    const allOnline = onlineCount === results.length;
    const latencySamples = results.filter((result) => typeof result.latency_ms === 'number');
    const avgLatency = latencySamples.length > 0
      ? latencySamples.reduce((sum, result) => sum + (result.latency_ms || 0), 0) / latencySamples.length
      : null;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      summary: {
        all_online: allOnline,
        online_count: onlineCount,
        total_providers: results.length,
        average_latency_ms: avgLatency === null ? null : Math.round(avgLatency),
        status: allOnline ? 'healthy' : 'degraded',
      },
      providers: results,
      recommended_action: !allOnline 
        ? 'Check provider API keys in .env.local and verify network connectivity'
        : 'All providers online. Cost-optimized multi-provider strategy is ready.',
    }, { 
      status: allOnline ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache', // Don't cache health checks
      }
    });
  } catch (error) {
    console.error('Provider health check error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'error',
    }, { status: 500 });
  }
}
