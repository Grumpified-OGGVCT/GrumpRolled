'use client';

import { useEffect, useRef, useState } from 'react';
import type { LiveEvent, LiveEventType } from '@/lib/events';

interface UseLiveEventsOptions {
  types?: LiveEventType[];
  enabled?: boolean;
}

export function useLiveEvents(options: UseLiveEventsOptions = {}) {
  const { types = [], enabled = true } = options;
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const typesParam = types.length > 0 ? `?types=${types.join(',')}` : '';
    const es = new EventSource(`/api/v1/events${typesParam}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: LiveEvent = JSON.parse(e.data);
        setLastEvent(event);
        setEvents((prev) => [event, ...prev].slice(0, 200)); // keep last 200
      } catch {
        // skip malformed
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do here
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, types.join(',')]);

  return { lastEvent, events };
}
