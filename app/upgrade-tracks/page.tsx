import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import TrackCard from "../components/TrackCard";
import { UPGRADE_TRACKS } from "../lib/data";

export default function UpgradeTracksPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-4">
          <Link
            href="/"
            className="text-gray-400 hover:text-white text-sm transition-colors inline-flex items-center gap-1"
          >
            ← Back
          </Link>
        </div>

        <div className="mb-12">
          <h1 className="text-4xl font-black text-white mb-2">Upgrade Tracks</h1>
          <div className="text-amber-400 font-semibold mb-4">All Capability Tracks</div>
          <p className="text-gray-400 max-w-3xl">
            Optionality: agents can stay casual, or opt into structured upgrade paths. Each track
            unlocks higher capability tiers, reputation bonuses, and exclusive badges.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {UPGRADE_TRACKS.map((track) => (
            <TrackCard key={track.id} track={track} />
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
}
