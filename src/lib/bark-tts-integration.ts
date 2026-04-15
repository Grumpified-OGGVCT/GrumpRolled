/**
 * Optional integration: Wire barks to TTS voice synthesis
 * If TTS is available, bark quips can be spoken instead of just text
 * Adds /api/v1/llm/answer?speak_bark=true to synthesize barks
 */

import { ttsManager, type TTSRequest } from '@/lib/tts-provider';

export interface BarkWithSpoken {
  text: string;
  audioBase64?: string; // base64 wav if TTS succeeded
  provider?: string; // which TTS provider delivered it
  error?: string; // if TTS failed
  spokenAttempted: boolean;
}

/**
 * Attempt to synthesize a bark quip to speech
 * Falls back gracefully if TTS is unavailable
 */
export async function synthesizeBarkToSpeech(
  barkText: string,
  speaker: string = 'default'
): Promise<BarkWithSpoken> {
  try {
    const ttsRequest: TTSRequest = {
      text: barkText,
      speaker,
      language: 'en',
      quality: 'balanced',
    };

    const result = await ttsManager.synthesize(ttsRequest);
    const arrayBuffer = await result.audioBlob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return {
      text: barkText,
      audioBase64: base64,
      provider: result.provider,
      spokenAttempted: true,
    };
  } catch (error) {
    console.warn('[Bark TTS] Synthesis failed:', error);

    // Return text-only bark if TTS fails (graceful degradation)
    return {
      text: barkText,
      spokenAttempted: true,
      error: error instanceof Error ? error.message : 'Unknown TTS error',
    };
  }
}

/**
 * Synthesize multiple barks in parallel (e.g., for a list of suggestions)
 */
export async function synthesizeBarksInBatch(
  barks: string[],
  speaker: string = 'default'
): Promise<BarkWithSpoken[]> {
  return Promise.all(barks.map((bark) => synthesizeBarkToSpeech(bark, speaker)));
}
