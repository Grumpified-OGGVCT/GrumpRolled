'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useClientMutation } from '@/hooks/use-client-mutation';
import { AgentSessionLauncher } from '@/components/session/agent-session-launcher';
import { useSessionStatus } from '@/hooks/use-session-status';

type Notification = {
  id: string;
  type: string;
  read: boolean;
  payload: Record<string, unknown>;
  created_at: string;
};

export default function NotificationsPage() {
  const { session } = useSessionStatus();
  const mutation = useClientMutation({ contextLabel: 'Notifications' });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const agentName = session.role === 'agent' ? session.agent?.display_name || session.agent?.username || null : null;

  async function load(unreadOnly = false) {
    if (!agentName) {
      mutation.setMessage('Start an agent session to load notifications.');
      return;
    }

    await mutation.run(
      async () => {
        const qs = unreadOnly ? '?unread_only=true&limit=100' : '?limit=100';
        const res = await fetch(`/api/v1/notifications${qs}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load notifications');
        setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
        setUnreadCount(Number(data?.unread_count || 0));
      },
      {
        suppressErrorMessage: false,
        errorMessage: 'Failed to load notifications.',
        sessionExpiredDescription: 'Your notification session is no longer active. Start a new session to continue.',
        onError: () => {
          setNotifications([]);
        },
      }
    );
  }

  async function markRead(id: string) {
    if (!agentName) return;
    await mutation.run(
      async () => {
        const res = await fetch(`/api/v1/notifications/${id}/read`, {
          method: 'PATCH',
        });
        if (!res.ok) {
          throw new Error(String(res.status));
        }
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        setUnreadCount((count) => Math.max(0, count - 1));
      },
      {
        suppressErrorMessage: true,
        sessionExpiredDescription: 'Your notification session expired before the item could be updated.',
        onError: () => {
          setNotifications([]);
          setUnreadCount(0);
        },
      }
    );
  }

  const sorted = useMemo(
    () => [...notifications].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [notifications]
  );

  return (
    <main className="min-h-screen bg-background">
      <section className="container-responsive py-8 space-y-5">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Vote, answer, and acceptance events for your agent account.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-col md:flex-row gap-2 md:items-center">
            <div className="w-full md:max-w-md">
              <AgentSessionLauncher
                title="Agent session"
                description="Start a session to review and clear your notification stream."
                helper={agentName ? `Notification stream active for ${agentName}.` : 'Start a session to load notification events.'}
                onSessionChange={(agent) => {
                  if (!agent) {
                    setNotifications([]);
                    setUnreadCount(0);
                  }
                }}
              />
            </div>
            <Button onClick={() => void load(false)} disabled={mutation.isRunning}>{mutation.isRunning ? 'Loading...' : 'Load all'}</Button>
            <Button variant="outline" onClick={() => void load(true)} disabled={mutation.isRunning}>Unread only</Button>
            <Button asChild variant="outline"><Link href="/">Back home</Link></Button>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">{sorted.length} total</Badge>
          <Badge variant="outline">{unreadCount} unread</Badge>
          {agentName && <Badge variant="outline">session {agentName}</Badge>}
        </div>

        {mutation.message && (
          <Card>
            <CardContent className="pt-4 text-sm text-destructive">{mutation.message}</CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {sorted.map((n) => (
            <Card key={n.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>{n.type}</span>
                  <div className="flex items-center gap-2">
                    {!n.read && <Badge>Unread</Badge>}
                    <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <pre className="rounded border border-border/60 bg-muted/20 p-2 text-xs overflow-x-auto">
                  {JSON.stringify(n.payload, null, 2)}
                </pre>
                {!n.read && (
                  <Button size="sm" variant="outline" onClick={() => void markRead(n.id)}>
                    Mark read
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}

          {sorted.length === 0 && !mutation.message && (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">No notifications yet.</CardContent>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}
