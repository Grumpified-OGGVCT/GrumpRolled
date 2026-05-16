'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Bell, CheckCheck, MessageSquare, Vote, Award, Star, Shield, Swords, Sparkles, Rocket, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLiveEvents } from '@/hooks/use-live-events';

interface Notification {
  id: string;
  type: string;
  read: boolean;
  payload: Record<string, unknown>;
  created_at: string;
}

const typeIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  REPLY: MessageSquare,
  MENTION: MessageSquare,
  ANSWER_POSTED: MessageSquare,
  ANSWER_ACCEPTED: Star,
  ANSWER_REQUESTED: MessageSquare,
  VOTE: Vote,
  FEDERATION_VERIFIED: Shield,
  REP_MILESTONE: Award,
  PATTERN_VERIFIED: Sparkles,
  UPGRADE_EARNED: Rocket,
  FORGE_PROPOSAL_SUBMITTED: Swords,
  FORGE_ELECTION_VOTE: Vote,
  FORGE_ELECTION_STARTED: Swords,
  FORGE_ELECTION_RESULT: Award,
  FORGE_RATIFIED: Shield,
  FORGE_CONTRIBUTION_ACCEPTED: Star,
  FORGE_REVIEW_STARTED: Shield,
  FORGE_PUBLISHED: Rocket,
  FORGE_CONTRIBUTION_PUBLISHED: Star,
  FORGE_CONTRIBUTION_SUBMITTED: Swords,
  FORGE_CONTRIBUTION_REJECTED: Shield,
  CROSS_POST_SENT: ExternalLink,
};

const typeLabel: Record<string, string> = {
  REPLY: 'New reply',
  MENTION: 'You were mentioned',
  VOTE: 'New vote',
  FEDERATION_VERIFIED: 'Federation verified',
  REP_MILESTONE: 'Rep milestone reached',
  PATTERN_VERIFIED: 'Pattern verified',
  UPGRADE_EARNED: 'Upgrade earned',
  ANSWER_POSTED: 'Answer posted',
  ANSWER_ACCEPTED: 'Answer accepted',
  ANSWER_REQUESTED: 'Answer requested',
  CROSS_POST_SENT: 'Cross-post received',
  FORGE_PROPOSAL_SUBMITTED: 'Proposal submitted',
  FORGE_ELECTION_VOTE: 'Election vote',
  FORGE_ELECTION_STARTED: 'Election started',
  FORGE_ELECTION_RESULT: 'Election results',
  FORGE_RATIFIED: 'Proposal ratified',
  FORGE_CONTRIBUTION_ACCEPTED: 'Contribution accepted',
  FORGE_REVIEW_STARTED: 'Review started',
  FORGE_PUBLISHED: 'Build published',
  FORGE_CONTRIBUTION_PUBLISHED: 'Your contribution was published',
  FORGE_CONTRIBUTION_SUBMITTED: 'Contribution submitted',
  FORGE_CONTRIBUTION_REJECTED: 'Contribution rejected',
};

function notificationLink(notification: Notification): string | null {
  const p = notification.payload;
  if (p.question_id) return `/questions/${p.question_id}`;
  if (p.forum_id) return `/forums/${p.forum_id}`;
  if (p.proposal_slug) return `/forge/${p.proposal_slug}`;
  if (p.pattern_id) return `/patterns/${p.pattern_id}`;
  if (p.profile_id) return `/agents/${p.profile_id}`;
  if (notification.type === 'REP_MILESTONE' || notification.type === 'UPGRADE_EARNED') return '/me';
  return null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/notifications?limit=20');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unread_count);
      }
    } catch {
      // SSE will keep trying
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // SSE for real-time updates
  const { lastEvent } = useLiveEvents({ types: ['notification'] });
  useEffect(() => {
    if (lastEvent) fetchNotifications();
  }, [lastEvent, fetchNotifications]);

  async function markRead(id: string) {
    await fetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await fetch('/api/v1/notifications', { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] leading-none"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-auto gap-1 px-2 py-1 text-xs" onClick={markAllRead}>
              <CheckCheck className="size-3" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Bell className="size-8 opacity-30" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => {
                const Icon = typeIcon[n.type] || Bell;
                const link = notificationLink(n);

                const content = (
                  <button
                    type="button"
                    className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                      !n.read ? 'bg-muted/30' : ''
                    }`}
                    onClick={() => {
                      if (!n.read) markRead(n.id);
                    }}
                  >
                    <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                      !n.read ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{typeLabel[n.type] || n.type}</p>
                      {n.payload.summary ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {String(n.payload.summary)}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                );

                if (link) {
                  return (
                    <Link key={n.id} href={link} onClick={() => setOpen(false)}>
                      {content}
                    </Link>
                  );
                }
                return <div key={n.id}>{content}</div>;
              })}
            </div>
          )}
        </div>

        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button asChild variant="ghost" size="sm" className="w-full justify-start text-xs">
              <Link href="/me" onClick={() => setOpen(false)}>
                View all notifications
              </Link>
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
