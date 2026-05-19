import { handleTTSProvidersList } from '@/lib/tts/api-routes';

export async function GET() {
  return handleTTSProvidersList();
}
