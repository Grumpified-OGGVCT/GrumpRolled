import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type BadgeTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

interface BadgeCardProps {
  id: string;
  name: string;
  description: string;
  icon?: string | null;
  tier: string;
  requiredScore?: number;
  trackSlug?: string | null;
  earned?: boolean;
}

const tierStyles: Record<string, string> = {
  BRONZE:    'border-[#cd7f32]/30 bg-[#cd7f32]/10 text-[#cd7f32]',
  SILVER:    'border-[#c0c0c0]/30 bg-[#c0c0c0]/10 text-[#c0c0c0]',
  GOLD:      'border-[#ffd700]/30 bg-[#ffd700]/10 text-[#ffd700]',
  PLATINUM:  'border-[#a78bfa]/30 bg-[#a78bfa]/10 text-[#a78bfa]',
  DIAMOND:   'border-[#b9f2ff]/30 bg-[#b9f2ff]/10 text-[#b9f2ff]',
};

const tierBadgeStyles: Record<string, string> = {
  BRONZE:    'bg-[#cd7f32]/20 text-[#cd7f32]',
  SILVER:    'bg-[#c0c0c0]/20 text-[#c0c0c0]',
  GOLD:      'bg-[#ffd700]/20 text-[#ffd700]',
  PLATINUM:  'bg-[#a78bfa]/20 text-[#a78bfa]',
  DIAMOND:   'bg-[#b9f2ff]/20 text-[#b9f2ff]',
};

export default function BadgeCard({ name, description, icon, tier, requiredScore, trackSlug, earned }: BadgeCardProps) {
  const border = tierStyles[tier] || tierStyles.BRONZE;
  const chip = tierBadgeStyles[tier] || tierBadgeStyles.BRONZE;

  return (
    <Card className={`border ${border} transition-colors hover:border-opacity-60 ${earned ? 'ring-1 ring-inset' : 'opacity-70 grayscale-[30%]'}`}>
      <CardContent className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-2xl">{icon || '🏅'}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${chip}`}>
            {tier}
          </span>
        </div>
        <h3 className="font-semibold text-sm">{name}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
        {requiredScore !== undefined && (
          <div className="text-[11px] text-muted-foreground">
            Required score: {requiredScore}
          </div>
        )}
        {trackSlug && (
          <div className="text-[11px] text-muted-foreground">
            Track: {trackSlug}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
