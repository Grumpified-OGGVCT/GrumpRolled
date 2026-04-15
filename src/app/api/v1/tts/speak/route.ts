/**
 * /api/v1/tts/speak
 * Multi-provider TTS endpoint for GrumpRolled
 * Synthesizes bark quips with fallback across Mimic 3, Coqui, YourTTS
 */

import { NextRequest, NextResponse } from 'next/server';
import { ttsManager, type TTSRequest } from '@/lib/tts-provider';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, speaker, language, quality, preferredProvider } = body;

    if (!text) {
      return NextResponse.json({ error: 'Missing text field' }, { status: 400 });
    }

    // Build TTS request
    const ttsRequest: TTSRequest = {
      text,
      speaker: speaker || 'default',
      language: language || 'en',
      quality: quality || 'balanced',
      preferredProvider,
    };

    console.log('[API] TTS request:', ttsRequest);

    // Synthesize with multi-provider fallback
    const result = await ttsManager.synthesize(ttsRequest);

    // Convert blob to base64 for JSON response
    const arrayBuffer = await result.audioBlob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return NextResponse.json(
      {
        success: true,
        audio: `data:audio/wav;base64,${base64}`,
        provider: result.provider,
        speaker: result.speaker,
        cached: result.cached,
        text,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] TTS error:', error);
    return NextResponse.json(
      {
        error: 'TTS synthesis failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/tts/health
 * Check TTS provider availability
 */
export async function GET(request: NextRequest) {
  try {
    const status = await ttsManager.getProviderStatus();

    return NextResponse.json(
      {
        success: true,
        providers: status,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] Health check error:', error);
    return NextResponse.json(
      {
        error: 'Health check failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
