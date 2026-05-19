import { NextRequest, NextResponse } from 'next/server';

import { handleTTSClearCache, handleTTSSynthesize } from '@/lib/tts/api-routes';

// Legacy compatibility surface.
// Canonical paths now live under /api/v1/tts/synthesize, /health, /providers, and /cache.
export async function POST(request: NextRequest) {
  const body = await request.json();
  return handleTTSSynthesize(body);
}

export async function GET() {
  return NextResponse.json({
    message: 'Use /api/v1/tts/synthesize, /api/v1/tts/health, /api/v1/tts/providers, and /api/v1/tts/cache.',
    routes: {
      synthesize: '/api/v1/tts/synthesize',
      health: '/api/v1/tts/health',
      providers: '/api/v1/tts/providers',
      cache: '/api/v1/tts/cache',
    },
  });
}

export async function DELETE() {
  return handleTTSClearCache();
}
