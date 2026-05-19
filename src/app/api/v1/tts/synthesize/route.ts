import { NextRequest } from 'next/server';

import { handleTTSSynthesize } from '@/lib/tts/api-routes';

export async function POST(request: NextRequest) {
  const body = await request.json();
  return handleTTSSynthesize(body);
}
