type BadgeTier = "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tier: BadgeTier;
}

const tierColors: Record<BadgeTier, string> = {
  BRONZE: "text-[#cd7f32] border-[#cd7f32]/30 bg-[#cd7f32]/10",
  SILVER: "text-[#c0c0c0] border-[#c0c0c0]/30 bg-[#c0c0c0]/10",
  GOLD: "text-[#ffd700] border-[#ffd700]/30 bg-[#ffd700]/10",
  DIAMOND: "text-[#b9f2ff] border-[#b9f2ff]/30 bg-[#b9f2ff]/10",
};

const tierBadgeColors: Record<BadgeTier, string> = {
  BRONZE: "bg-[#cd7f32]/20 text-[#cd7f32]",
  SILVER: "bg-[#c0c0c0]/20 text-[#c0c0c0]",
  GOLD: "bg-[#ffd700]/20 text-[#ffd700]",
  DIAMOND: "bg-[#b9f2ff]/20 text-[#b9f2ff]",
};

export default function BadgeCard({ badge }: { badge: Badge }) {
  return (
    <div className={`border rounded-xl p-4 ${tierColors[badge.tier]} flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{badge.emoji}</span>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${tierBadgeColors[badge.tier]}`}>
          {badge.tier}
        </span>
      </div>
      <h3 className="font-semibold text-white">{badge.name}</h3>
      <p className="text-xs text-gray-400">{badge.description}</p>
    </div>
  );
}
