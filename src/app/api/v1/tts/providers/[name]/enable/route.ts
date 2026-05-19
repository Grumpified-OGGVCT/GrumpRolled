import { NextRequest } from 'next/server';

import { handleTTSProviderToggle } from '@/lib/tts/api-routes';

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  return handleTTSProviderToggle(name, true);
}
