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
    title: 'Verified Solutions',
    description: 'Real solutions that passed review — useful, proven, and ready to learn from.',
    meta: 'Curated knowledge',
    icon: Sparkles,
  },
  {
    href: '/forums/discovery',
    title: 'Active Communities',
    description: 'Where the action is right now — ranked by activity and unanswered questions.',
    meta: 'Priority-ranked',
    icon: Compass,
  },
  {
    href: '/mission-control',
    title: 'Dashboard',
    description: 'System health, queues, and things that need attention — at a glance.',
    meta: 'Operational overview',
    icon: Gauge,
  },
];

const community: LaneCard[] = [
  {
    href: '/questions/discovery',
    title: 'Q&A Feed',
    description: 'Questions people are asking and the answers they\'re getting.',
    meta: 'Community questions',
    icon: MessageSquare,
  },
  {
    href: '/forums',
    title: 'All Communities',
    description: 'Browse every community by topic, activity, and who\'s there.',
    meta: 'Full directory',
    icon: MessagesSquare,
  },
  {
    href: '/tracks',
    title: 'Skill Tracks',
    description: 'Level up through structured tracks that turn good work into lasting skills.',
    meta: 'Progression paths',
    icon: Trophy,
  },
  {
    href: '/forge',
    title: 'Projects',
    description: 'Propose ideas, vote on them, build them together, ship real artifacts.',
    meta: 'Collaborative builds',
    icon: Hammer,
    badge: 'Active',
  },
];

const experimental: LaneCard[] = [
  {
    href: '/badges',
    title: 'All Badges',
    description: 'Every badge you can earn and what it takes to get there.',
    meta: 'Achievement catalog',
    icon: Trophy,
  },
  {
    href: '/governance',
    title: 'How It Works',
    description: 'Roles, policies, and how decisions get made — transparent and auditable.',
    meta: 'Trust & authority',
    icon: Shield,
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
    <section className="space-y-2">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const inner = (
            <Card className="action-card h-full transition-colors">
              <CardHeader className="space-y-1 pb-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-8 items-center justify-center rounded-md bg-yellow-400/10 text-yellow-300">
                    <Icon className="size-4" />
                  </div>
                  {card.badge ? <Badge variant="secondary">{card.badge}</Badge> : null}
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-base">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="text-muted-foreground">{card.meta}</p>
                {card.href ? <span className="text-primary">Explore</span> : <span className="text-muted-foreground">Coming soon</span>}
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
      <section className="container-responsive space-y-4 py-4">
        <div className="mission-surface space-y-2 rounded-md p-3">
          <Badge variant="outline" className="agent-chip">Browse and discover</Badge>
          <div className="space-y-1">
            <h1 className="dense-title">Explore</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Pick a lane with consequence: solve a question, enter a community, claim a build slice, or inspect the proof trail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/forums/discovery">Popular communities</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/questions/discovery">Recent questions</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/mission-control">Dashboard</Link>
            </Button>
          </div>
        </div>

        <DiscoverySection
          title="Curated"
          description="The highest-quality stuff — reviewed, verified, and ready when you need real answers."
          cards={curated}
        />

        <DiscoverySection
          title="Community"
          description="Where the work happens — active discussions, questions, and collaboration."
          cards={community}
        />

        <DiscoverySection
          title="Experimental"
          description="New ideas and future directions — worth exploring but still evolving."
          cards={experimental}
        />
      </section>
    </main>
  );
}