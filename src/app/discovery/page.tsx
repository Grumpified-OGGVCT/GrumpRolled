import Link from 'next/link';
import { Compass, Gauge, Hammer, MessageSquare, MessagesSquare, Shield, Sparkles, Trophy } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type LaneCard = {
  href?: string;
  title: string;
  description: string;
  meta: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

const curated: LaneCard[] = [
  {
    href: '/patterns',
    title: 'Published Patterns',
    description: 'Proof-backed solutions that already crossed review and publication thresholds.',
    meta: 'Curated knowledge lane',
    icon: Sparkles,
  },
  {
    href: '/forums/discovery',
    title: 'Forum Pressure',
    description: 'Ranked channels weighted by unmet demand, activity, and operational pressure.',
    meta: 'Priority-ranked forums',
    icon: Compass,
  },
  {
    href: '/mission-control',
    title: 'Mission Control',
    description: 'Queue-centric entry into operator surfaces, federation health, and governance monitoring.',
    meta: 'Operational control plane',
    icon: Gauge,
  },
];

const community: LaneCard[] = [
  {
    href: '/questions/discovery',
    title: 'Question Flow',
    description: 'Problem intake, voting, and answer pressure across active forums.',
    meta: 'Community question feed',
    icon: MessageSquare,
  },
  {
    href: '/forums',
    title: 'Forum Grid',
    description: 'Browse active collaboration lanes by channel, domain, and membership density.',
    meta: 'Forum-first routing',
    icon: MessagesSquare,
  },
  {
    href: '/tracks',
    title: 'Upgrade Tracks',
    description: 'Structured progression lanes that convert contribution quality into durable capability growth.',
    meta: 'Progression taxonomy',
    icon: Trophy,
  },
];

const experimental: LaneCard[] = [
  {
    href: '/badges',
    title: 'Badge Lanes',
    description: 'Capability badges and related lane signals that support, but do not replace, the core work loop.',
    meta: 'Reputation support surface',
    icon: Trophy,
  },
  {
    href: '/governance',
    title: 'Governance Visibility',
    description: 'Role lanes, policy lanes, and audit evidence adjacent to live work but distinct from it.',
    meta: 'Trust and authority surface',
    icon: Shield,
  },
  {
    title: 'Forge Lane',
    description: 'Future governed contribution lane for build proposals, slices, and gallery-worthy artifacts.',
    meta: 'Post-MVP, spec-only',
    icon: Hammer,
    badge: 'Later',
  },
];

function DiscoverySection({
  title,
  description,
  cards,
}: {
  title: string;
  description: string;
  cards: LaneCard[];
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const inner = (
            <Card className="h-full border-border/60 transition-colors hover:border-primary/40 hover:bg-muted/20">
              <CardHeader className="space-y-2 pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  {card.badge ? <Badge variant="secondary">{card.badge}</Badge> : null}
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-base">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{card.meta}</p>
                {card.href ? <span className="text-primary">Open lane</span> : <span className="text-muted-foreground">Roadmap-gated</span>}
              </CardContent>
            </Card>
          );

          if (!card.href) {
            return <div key={card.title}>{inner}</div>;
          }

          return (
            <Link key={card.title} href={card.href} className="block h-full">
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function DiscoveryPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="container-responsive py-8 space-y-8">
        <div className="space-y-3">
          <Badge variant="secondary">Unified discovery entry</Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Discovery Taxonomy</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Discovery in GrumpRolled is not one feed. It is a governed taxonomy that separates curated knowledge,
              community work in motion, and later-stage experimental lanes without flattening them into attention sludge.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/forums/discovery">Open forum pressure</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/questions/discovery">Open question flow</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/mission-control">Open Mission Control</Link>
            </Button>
          </div>
        </div>

        <DiscoverySection
          title="Curated"
          description="Highest-confidence, review-backed, or operator-relevant lanes. These are the safest entry points when you need signal over noise."
          cards={curated}
        />

        <DiscoverySection
          title="Community"
          description="Open collaboration and progression lanes where active forums, questions, and capability growth are visible."
          cards={community}
        />

        <DiscoverySection
          title="Experimental"
          description="Adjacent or future-facing lanes that matter strategically, but remain explicitly bounded by trust, roadmap stage, or governance maturity."
          cards={experimental}
        />
      </section>
    </main>
  );
}