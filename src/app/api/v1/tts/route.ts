/**
 * TTS API Route with Multi-Provider Support
 * 
 * Routes:
 * - POST /api/v1/tts/synthesize  - Synthesize speech
 * - GET /api/v1/tts/health       - Check provider health
 * - GET /api/v1/tts/providers    - List available providers
 * - POST /api/v1/tts/providers/:name/enable  - Enable provider
 * - POST /api/v1/tts/providers/:name/disable - Disable provider
 * - DELETE /api/v1/tts/cache     - Clear cache
 */

import { NextRequest, NextResponse } from 'next/server';
import { TTSManager, createTTSManagerFromEnv, TTSRequest } from '@/lib/tts/multi-provider';

let ttsManager: TTSManager | null = null;

/**
 * Initialize TTS manager (lazy load)
 */
function getTTSManager(): TTSManager {
  if (!ttsManager) {
    try {
      ttsManager = createTTSManagerFromEnv();
    } catch (error) {
      console.error('Failed to initialize TTS manager:', error);
      throw error;
    }
  }
  return ttsManager;
}

/**
 * POST /api/v1/tts/synthesize
 * Synthesize text to speech
 */
export async function POST(request: NextRequest) {
  try {
    const manager = getTTSManager();
    const body = await request.json();

    const { text, voice, language, speaker, speed, provider } = body;

    if (!text) {
      return NextResponse.json(
        { error: 'text is required' },
        { status: 400 }
      );
    }

    const ttsRequest: TTSRequest = {
      text,
      voice,
      language,
      speaker,
      speed,
    };

    const response = await manager.synthesize(ttsRequest, provider);

    // Return audio with appropriate headers
    return new NextResponse(new Uint8Array(response.audio), {
      status: 200,
      headers: {
        'Content-Type': response.mimeType,
        'Content-Disposition': 'inline',
        'Cache-Control': response.cached ? 'public, max-age=86400' : 'no-cache',
        'X-TTS-Provider': response.provider,
        'X-TTS-Cached': String(response.cached),
      },
    });
  } catch (error) {
    console.error('TTS synthesis error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'TTS synthesis failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/tts/health
 * Check provider health status
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  // Route to health check endpoint
  if (url.pathname === '/api/v1/tts/health') {
    try {
      const manager = getTTSManager();
      const health = await manager.getAllHealthStatus();

      const summary = {
        success: health.some((p) => p.healthy),
        providers: Object.fromEntries(
          health.map((p) => [p.name, p.healthy])
        ),
        details: health,
        timestamp: new Date().toISOString(),
      };

      return NextResponse.json(summary, { status: 200 });
    } catch (error) {
      return NextResponse.json(
        { error: 'Health check failed' },
        { status: 500 }
      );
    }
  }

  // Route to list providers
  if (url.pathname === '/api/v1/tts/providers') {
    try {
      const manager = getTTSManager();
      const providers = manager.listProviders();

      return NextResponse.json(
        {
          providers: providers.map((p) => ({
            name: p.name,
            enabled: p.enabled,
            priority: p.priority,
            endpoint: p.endpoint,
            supportsCustomVoice: p.supportsCustomVoice,
            supportsLanguages: p.supportsLanguages,
            maxLength: p.maxLength,
          })),
          count: providers.length,
        },
        { status: 200 }
      );
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to list providers' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { error: 'Not found' },
    { status: 404 }
  );
}

/**
 * POST /api/v1/tts/providers/:name/:action
 * Enable/disable providers or clear cache
 */
export async function PUT(request: NextRequest) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Route: /api/v1/tts/providers/:name/enable
  const enableMatch = pathname.match(/\/api\/v1\/tts\/providers\/([^/]+)\/enable$/);
  if (enableMatch) {
    try {
      const manager = getTTSManager();
      const name = enableMatch[1];
      manager.setProviderEnabled(name, true);

      return NextResponse.json(
        { success: true, message: `Provider ${name} enabled` },
        { status: 200 }
      );
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to enable provider' },
        { status: 500 }
      );
    }
  }

  // Route: /api/v1/tts/providers/:name/disable
  const disableMatch = pathname.match(/\/api\/v1\/tts\/providers\/([^/]+)\/disable$/);
  if (disableMatch) {
    try {
      const manager = getTTSManager();
      const name = disableMatch[1];
      manager.setProviderEnabled(name, false);

      return NextResponse.json(
        { success: true, message: `Provider ${name} disabled` },
        { status: 200 }
      );
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to disable provider' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { error: 'Not found' },
    { status: 404 }
  );
}

/**
 * DELETE /api/v1/tts/cache
 * Clear TTS response cache
 */
export async function DELETE(request: NextRequest) {
  try {
    const manager = getTTSManager();
    manager.clearCache();

    return NextResponse.json(
      { success: true, message: 'TTS cache cleared' },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}
