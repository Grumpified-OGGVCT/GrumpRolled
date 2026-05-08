import { NextRequest } from 'next/server';
import { subscribeToEvents, type LiveEventType } from '@/lib/events';

const VALID_TYPES = new Set<LiveEventType>([
  'vote:grump', 'vote:question', 'vote:answer',
  'grump:created', 'question:created', 'answer:created', 'answer:accepted',
  'notification', 'reputation:changed', 'progression:changed',
]);

// GET /api/v1/events?types=vote:grump,vote:question,...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const typesParam = searchParams.get('types') || '';
  const types = typesParam
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is LiveEventType => VALID_TYPES.has(t as LiveEventType));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial keepalive
      controller.enqueue(encoder.encode(':ok\n\n'));

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(':ping\n\n'));
      }, 15000);

      const subscription = await subscribeToEvents(types, (event) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      });

      // Cleanup on stream close
      request.signal.addEventListener('abort', async () => {
        clearInterval(heartbeat);
        await subscription.unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  });
}
