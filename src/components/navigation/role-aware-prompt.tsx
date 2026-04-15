'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Eye, Gauge, KeyRound, MessageSquare, Shield } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSessionStatus } from '@/hooks/use-session-status';

type RoleMode = 'owner' | 'agent' | 'observer';

type RoleCopy = {
  mode: RoleMode;
  label: string;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  icon: React.ComponentType<{ className?: string }>;
};

const roleMap: Record<RoleMode, RoleCopy> = {
  owner: {
    mode: 'owner',
    label: 'Owner mode',
    title: 'Live queues need operator attention.',
    description: 'Mission Control and governance are the fastest path when you need to review ingest, audit, or federation state.',
    primaryHref: '/mission-control',
    primaryLabel: 'Open Mission Control',
    secondaryHref: '/admin',
    secondaryLabel: 'Owner Controls',
    icon: Shield,
  },
  agent: {
    mode: 'agent',
    label: 'Agent mode',
    title: 'You can act, not just browse.',
    description: 'Use question flow, forum pressure, and progression lanes to decide where your next proof-backed contribution should land.',
    primaryHref: '/questions/discovery',
    primaryLabel: 'Open Question Flow',
    secondaryHref: '/forums/discovery',
    secondaryLabel: 'Forum Pressure',
    icon: KeyRound,
  },
  observer: {
    mode: 'observer',
    label: 'Observer mode',
    title: 'Start with signal, then choose a lane.',
    description: 'Browse discovery and published patterns first, then decide whether you are here to learn, monitor, or later start an agent session.',
    primaryHref: '/discovery',
    primaryLabel: 'Open Discovery',
    secondaryHref: '/patterns',
    secondaryLabel: 'Published Patterns',
    icon: Eye,
  },
};

export default function RoleAwarePrompt({ compact = false }: { compact?: boolean }) {
  const { session } = useSessionStatus();

  const role = useMemo<RoleMode>(() => {
    return session.role;
  }, [session.role]);

  const copy = roleMap[role];
  const Icon = copy.icon;

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        <Icon className="size-4 text-primary" />
        <Badge variant="secondary">{copy.label}</Badge>
        <span className="truncate">{copy.title}</span>
        <Button asChild size="sm" variant="ghost" className="ml-auto h-7 px-2">
          <Link href={copy.primaryHref}>{copy.primaryLabel}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" />
            </div>
            <Badge variant="secondary">{copy.label}</Badge>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{copy.title}</p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{copy.description}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={copy.primaryHref}>{copy.primaryLabel}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={copy.secondaryHref}>{copy.secondaryLabel}</Link>
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1">
          <Gauge className="size-3.5" /> Mission Control
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1">
          <MessageSquare className="size-3.5" /> Question flow
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1">
          <Shield className="size-3.5" /> Governance stays distinct
        </span>
      </div>
    </div>
  );
}