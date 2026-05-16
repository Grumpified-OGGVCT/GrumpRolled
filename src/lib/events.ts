import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let pubClient: Redis | null = null;
let subClient: Redis | null = null;

function getPubClient(): Redis {
  if (!pubClient) {
    pubClient = new Redis(REDIS_URL);
  }
  return pubClient;
}

function getSubClient(): Redis {
  if (!subClient) {
    subClient = new Redis(REDIS_URL);
  }
  return subClient;
}

// ============================================================================
// Event types
// ============================================================================

export type LiveEventType =
  | 'vote:grump'
  | 'vote:question'
  | 'vote:answer'
  | 'grump:created'
  | 'question:created'
  | 'answer:created'
  | 'answer:accepted'
  | 'notification'
  | 'reputation:changed'
  | 'progression:changed'
  | 'forge:vote'
  | 'forge:proposal_created'
  | 'forge:election_started'
  | 'forge:election_closed'
  | 'forge:ratified'
  | 'forge:brief_frozen'
  | 'forge:contribution'
  | 'forge:contribution_submitted'
  | 'forge:contribution_reviewed'
  | 'forge:review_started'
  | 'forge:published'
  | 'audit:event';

export interface LiveEvent {
  type: LiveEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

// Channels map to event types so clients can subscribe selectively
const CHANNEL_PREFIX = 'grumprolled:events';

function channelForType(type: LiveEventType): string {
  return `${CHANNEL_PREFIX}:${type}`;
}

// Broadcast channel for all events
const ALL_CHANNEL = `${CHANNEL_PREFIX}:all`;

// ============================================================================
// Publish
// ============================================================================

export async function publishLiveEvent(type: LiveEventType, payload: Record<string, unknown> = {}): Promise<void> {
  const event: LiveEvent = {
    type,
    timestamp: new Date().toISOString(),
    payload,
  };

  const message = JSON.stringify(event);
  const pub = getPubClient();

  // Publish to both the specific channel and the broadcast channel
  await Promise.all([
    pub.publish(channelForType(type), message),
    pub.publish(ALL_CHANNEL, message),
  ]);
}

// ============================================================================
// Subscribe (used by SSE endpoint)
// ============================================================================

export interface EventSubscription {
  onEvent: (event: LiveEvent) => void;
  unsubscribe: () => Promise<void>;
}

export async function subscribeToEvents(
  types: LiveEventType[],
  onEvent: (event: LiveEvent) => void
): Promise<EventSubscription> {
  const sub = getSubClient();

  const channels = types.length > 0
    ? types.map(channelForType)
    : [ALL_CHANNEL];

  await sub.subscribe(...channels, ALL_CHANNEL);

  const handler = (_channel: string, message: string) => {
    try {
      const event = JSON.parse(message) as LiveEvent;
      onEvent(event);
    } catch {
      // skip malformed messages
    }
  };

  sub.on('message', handler);

  return {
    onEvent,
    unsubscribe: async () => {
      sub.off('message', handler);
      await sub.unsubscribe(...channels, ALL_CHANNEL);
    },
  };
}
