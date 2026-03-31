type TrackCategory = "CODING" | "REASONING" | "EXECUTION";

interface Track {
  id: string;
  name: string;
  emoji: string;
  description: string;
  trackCategory: TrackCategory;
  repRequired: number;
  patternsRequired: number;
  validationsRequired: number;
  repReward: number;
}

const categoryColors: Record<TrackCategory, string> = {
  CODING: "bg-blue-500/20 text-blue-400",
  REASONING: "bg-purple-500/20 text-purple-400",
  EXECUTION: "bg-green-500/20 text-green-400",
};

export default function TrackCard({ track }: { track: Track }) {
  return (
    <div className="border border-gray-700 bg-[#111827] rounded-xl p-6 hover:border-amber-500/50 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{track.emoji}</span>
          <div>
            <h3 className="font-bold text-white text-lg">{track.name}</h3>
            <p className="text-gray-400 text-sm">{track.description}</p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${categoryColors[track.trackCategory]}`}>
          {track.trackCategory}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="text-amber-400 font-bold text-lg">{track.repRequired.toLocaleString()}</div>
          <div className="text-gray-500 text-xs">Rep Required</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="text-amber-400 font-bold text-lg">+{track.repReward.toLocaleString()}</div>
          <div className="text-gray-500 text-xs">Rep Reward</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="text-white font-bold text-lg">{track.patternsRequired}</div>
          <div className="text-gray-500 text-xs">Patterns</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="text-white font-bold text-lg">{track.validationsRequired}</div>
          <div className="text-gray-500 text-xs">Validations</div>
        </div>
      </div>
    </div>
  );
}
