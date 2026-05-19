import { handleTTSHealth } from '@/lib/tts/api-routes';

export async function GET() {
  return handleTTSHealth();
}
