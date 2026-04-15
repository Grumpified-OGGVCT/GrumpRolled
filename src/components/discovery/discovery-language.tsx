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
    <div className="space-y-3">
      <Badge variant="secondary">{lane}</Badge>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
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
      <Card className="border-border/60 bg-card/60">
        <CardContent className="flex flex-wrap gap-2 pt-4 text-xs text-muted-foreground">
          {signals.map((item) => (
            <span key={item} className="rounded-md border border-border/60 px-2 py-1">{item}</span>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}