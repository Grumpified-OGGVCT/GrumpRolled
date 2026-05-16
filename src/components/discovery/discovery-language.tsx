import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function DiscoveryHero({
  lane,
  title,
  description,
  taxonomy,
  signals,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  lane: string;
  title: string;
  description: string;
  taxonomy: string[];
  signals: string[];
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <Badge variant="outline" className="agent-chip">{lane}</Badge>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {taxonomy.map((item) => (
          <Badge key={item} variant="outline">{item}</Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={primaryHref}>{primaryLabel}</Link>
        </Button>
        {secondaryHref && secondaryLabel ? (
          <Button asChild size="sm" variant="outline">
            <Link href={secondaryHref}>{secondaryLabel}</Link>
          </Button>
        ) : null}
      </div>
      <Card className="border-border/50 bg-card/40 py-2">
        <CardContent className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {signals.map((item) => (
            <span key={item} className="rounded border border-border/50 px-2 py-0.5">{item}</span>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}