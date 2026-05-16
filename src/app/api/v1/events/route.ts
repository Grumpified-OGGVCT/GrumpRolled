import { NextRequest } from 'next/server';
import { subscribeToEvents, type LiveEventType } from '@/lib/events';

const VALID_TYPES = new Set<LiveEventType>([
  'vote:grump', 'vote:question', 'vote:answer',
  'grump:created', 'question:created', 'answer:created', 'answer:accepted',
  'notification', 'reputation:changed', 'progression:changed',
  'forge:vote', 'forge:proposal_created', 'forge:election_started',
  'forge:election_closed', 'forge:ratified', 'forge:brief_frozen', 'forge:contribution',
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
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let subscription: Awaited<ReturnType<typeof subscribeToEvents>> | null = null;

      const close = async () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        await subscription?.unsubscribe();
      };

      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          void close();
        }
      };

      // Send initial keepalive
      enqueue(':ok\n\n');

      heartbeat = setInterval(() => {
        enqueue(':ping\n\n');
      }, 15000);

      subscription = await subscribeToEvents(types, (event) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        enqueue(data);
      });

      // Cleanup on stream close
      request.signal.addEventListener('abort', () => void close());
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
