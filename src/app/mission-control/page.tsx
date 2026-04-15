import Link from 'next/link';
import { ArrowRight, Compass, Gauge, Shield, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const lanes = [
  {
    href: '/admin?tab=queue&queueGroup=High+Priority',
    title: 'Owner Controls',
    description: 'External ingest queue, federation health, alert review, and owner-level operational oversight.',
    badge: 'Live',
  },
  {
    href: '/governance',
    title: 'Governance Lanes',
    description: 'Role authority, runtime policy, orchestration history, and audit evidence.',
    badge: 'Live',
  },
  {
    href: '/admin?tab=federation&platformFilter=attention',
    title: 'Federation Attention',
    description: 'Deep-link into platforms that are stale, unsynced, or otherwise demanding owner review.',
    badge: 'Live',
  },
  {
    href: '/federation/cross-posts',
    title: 'Cross-Post Queue',
    description: 'Owner-facing visibility into outbound ChatOverflow queue state and worker status.',
    badge: 'Live',
  },
  {
    href: '/forums/discovery',
    title: 'Pressure Signals',
    description: 'Channel urgency, demand pressure, and routing signals that feed operational focus.',
    badge: 'Live',
  },
  {
    href: '/questions/discovery',
    title: 'Question Flow',
    description: 'Question movement, active forums, and the community demand surface.',
    badge: 'Live',
  },
];

export default function MissionControlPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="container-responsive py-8 space-y-6">
        <div className="space-y-3">
          <Badge variant="secondary">Operational gateway</Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Mission Control is the operator-facing lane for live work. It brings together queues, health, audit visibility,
              and routing pressure without pretending governance and execution are the same thing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/admin">Open owner controls</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/governance">Open governance</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {lanes.map((lane) => (
            <Link key={lane.href} href={lane.href} className="block h-full">
              <Card className="h-full border-border/60 transition-colors hover:border-primary/40 hover:bg-muted/20">
                <CardHeader className="space-y-2 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{lane.title}</CardTitle>
                    <Badge variant="outline">{lane.badge}</Badge>
                  </div>
                  <CardDescription>{lane.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Enter lane</span>
                  <ArrowRight className="size-4 text-primary" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Gauge className="size-5" />
              </div>
              <CardTitle className="text-base">What Mission Control owns</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Queue triage, federation visibility, operator alerts, audit adjacency, and the routing pressure that determines what needs attention now.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Shield className="size-5" />
              </div>
              <CardTitle className="text-base">What it does not own</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              It does not collapse governance into analytics, and it does not auto-promote future Forge collaboration without the trust, appeal, and validation gates already defined in doctrine.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Compass className="size-5" />
              </div>
              <CardTitle className="text-base">Adjacent lanes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Use Discovery when you need breadth across questions, forums, and patterns.</p>
              <p>Use Governance when you need authority, policy, or audit evidence.</p>
              <p className="flex items-center gap-2 text-foreground">
                <Sparkles className="size-4 text-primary" />
                Forge remains roadmap-gated.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}