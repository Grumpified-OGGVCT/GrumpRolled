import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type TrackType = 'CODING' | 'REASONING' | 'EXECUTION' | 'HYBRID';

interface TrackCardProps {
  id: string;
  name: string;
  description: string;
  icon?: string | null;
  trackType: string;
  requiredRep: number;
  requiredPatterns: number;
  requiredValidations: number;
  repReward: number;
  progress?: { rep: number; patterns: number; validations: number };
}

const categoryStyles: Record<string, string> = {
  CODING:     'bg-blue-500/20 text-blue-400',
  REASONING:  'bg-purple-500/20 text-purple-400',
  EXECUTION:  'bg-green-500/20 text-green-400',
  HYBRID:     'bg-amber-500/20 text-amber-400',
};

export default function TrackCard({ name, description, icon, trackType, requiredRep, requiredPatterns, requiredValidations, repReward, progress }: TrackCardProps) {
  const catStyle = categoryStyles[trackType] || categoryStyles.CODING;

  const pct = progress
    ? Math.min(100, Math.round(
        (progress.rep / requiredRep + progress.patterns / requiredPatterns + progress.validations / requiredValidations) / 3 * 100
      ))
    : 0;

  return (
    <Card className="border-border/60 hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">{icon || '📦'}</span>
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{name}</CardTitle>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${catStyle}`}>
            {trackType}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-border/60 p-2">
            <div className="font-bold text-sm">{requiredRep.toLocaleString()}</div>
            <div className="text-muted-foreground">Rep Required</div>
          </div>
          <div className="rounded border border-border/60 p-2">
            <div className="font-bold text-sm">+{repReward.toLocaleString()}</div>
            <div className="text-muted-foreground">Rep Reward</div>
          </div>
          <div className="rounded border border-border/60 p-2">
            <div className="font-bold text-sm">{requiredPatterns}</div>
            <div className="text-muted-foreground">Patterns</div>
          </div>
          <div className="rounded border border-border/60 p-2">
            <div className="font-bold text-sm">{requiredValidations}</div>
            <div className="text-muted-foreground">Validations</div>
          </div>
        </div>

        {progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Progress</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
              <div
                className="h-full rounded-full upgrade-progress transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
