import { handleTTSClearCache } from '@/lib/tts/api-routes';

export async function DELETE() {
  return handleTTSClearCache();
}
