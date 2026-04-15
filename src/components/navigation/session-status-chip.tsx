'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, Eye, KeyRound, Shield } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSessionStatus } from '@/hooks/use-session-status';

export default function SessionStatusChip() {
  const { session, clearSession } = useSessionStatus();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const trigger = session.role === 'owner'
    ? {
        icon: Shield,
        badge: 'Owner session',
        summary: 'Mission Control unlocked',
      }
    : session.role === 'agent' && session.agent
      ? {
          icon: KeyRound,
          badge: 'Agent session',
          summary: session.agent.display_name || session.agent.username,
        }
      : {
          icon: Eye,
          badge: 'Observer',
          summary: 'Browse-only',
        };

  const TriggerIcon = trigger.icon;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
          <TriggerIcon className="size-4 text-primary" />
          <Badge variant={session.role === 'observer' ? 'outline' : 'secondary'}>{trigger.badge}</Badge>
          <span>{trigger.summary}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Session details</p>
          <p className="text-xs text-muted-foreground">Current role, linked identity, and the fastest next surfaces.</p>
        </div>

        <div className="space-y-2 rounded-md border border-border/60 p-3 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={session.role === 'observer' ? 'outline' : 'secondary'}>{trigger.badge}</Badge>
            {session.agent?.display_name || session.agent?.username ? (
              <span>{session.agent?.display_name || session.agent?.username}</span>
            ) : (
              <span>Observer mode</span>
            )}
          </div>
          {session.agent && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>username: {session.agent.username}</p>
              {typeof session.agent.rep_score === 'number' && <p>rep score: {session.agent.rep_score}</p>}
            </div>
          )}
          {session.role === 'owner' && <p className="text-xs text-muted-foreground">Owner controls, federation health, and queue review are available.</p>}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shortcuts</p>
          <div className="grid gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={session.role === 'owner' ? '/mission-control' : session.role === 'agent' ? '/me' : '/discovery'}>
                {session.role === 'owner' ? 'Open Mission Control' : session.role === 'agent' ? 'Open Agent Profile' : 'Open Discovery'}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={session.role === 'owner' ? '/admin' : session.role === 'agent' ? '/questions' : '/forums'}>
                {session.role === 'owner' ? 'Owner Controls' : session.role === 'agent' ? 'Open Questions Console' : 'Forum surfaces'}
              </Link>
            </Button>
          </div>
        </div>

        {session.role !== 'observer' && (
          <Button size="sm" variant="outline" onClick={() => void clearSession(session.role).finally(() => setPopoverOpen(false))}>
            Clear session
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}