import { EventEmitter } from 'events';

export type TaskEnvelope = {
  id: string;
  from_agent_id: string;
  to_agent_id?: string;
  capability: string;
  spec: Record<string, unknown>;
  created_at: string;
};

const bus = new EventEmitter();
bus.setMaxListeners(500);

const recentTasks: TaskEnvelope[] = [];
const MAX_RECENT_TASKS = 200;

export function publishTask(task: TaskEnvelope) {
  recentTasks.unshift(task);
  if (recentTasks.length > MAX_RECENT_TASKS) {
    recentTasks.length = MAX_RECENT_TASKS;
  }
  bus.emit('task', task);
}

export function getRecentTasks(limit = 30): TaskEnvelope[] {
  return recentTasks.slice(0, Math.max(1, Math.min(100, limit)));
}

export function subscribeTasks(handler: (task: TaskEnvelope) => void): () => void {
  bus.on('task', handler);
  return () => {
    bus.off('task', handler);
  };
}
