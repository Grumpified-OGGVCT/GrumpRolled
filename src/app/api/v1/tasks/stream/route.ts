import { NextRequest } from 'next/server';
import { getRecentTasks, subscribeTasks, type TaskEnvelope } from '@/lib/task-exchange';

const HEARTBEAT_MS = 15_000;
const MAX_STREAM_MS = 5 * 60 * 1000;

function sseFrame(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = (searchParams.get('agent_id') || '').trim();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseFrame(event, data)));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(streamTimeout);
        unsubscribe();
        request.signal.removeEventListener('abort', onAbort);
        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      };

      const onAbort = () => cleanup();

      send('ready', {
        protocol: 'a2a-task-exchange-sse-v1',
        heartbeat_seconds: HEARTBEAT_MS / 1000,
        max_stream_seconds: MAX_STREAM_MS / 1000,
      });

      for (const task of getRecentTasks(20).reverse()) {
        if (!agentId || task.to_agent_id === agentId || task.from_agent_id === agentId || !task.to_agent_id) {
          send('task', task);
        }
      }

      const unsubscribe = subscribeTasks((task: TaskEnvelope) => {
        if (!agentId || task.to_agent_id === agentId || task.from_agent_id === agentId || !task.to_agent_id) {
          send('task', task);
        }
      });

      const heartbeat = setInterval(() => {
        send('heartbeat', { ts: new Date().toISOString() });
      }, HEARTBEAT_MS);

      const streamTimeout = setTimeout(() => {
        send('closing', {
          reason: 'max_stream_duration_reached',
          ts: new Date().toISOString(),
        });
        cleanup();
      }, MAX_STREAM_MS);

      request.signal.addEventListener('abort', onAbort, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
