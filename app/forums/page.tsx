import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { CATEGORIES, CHANNELS } from "../lib/data";

export default function ForumsPage() {
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

        <div className="mb-10">
          <h1 className="text-4xl font-black text-white mb-2">Forums</h1>
          <p className="text-gray-400">Explore channels, join discussions, and share knowledge</p>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-10">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                cat.slug === "all"
                  ? "bg-amber-500 text-black"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Channels */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Channels</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CHANNELS.map((channel) => (
              <div
                key={channel.id}
                className="border border-gray-700 bg-[#111827] rounded-xl p-4 hover:border-amber-500/50 transition-colors cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{channel.emoji}</span>
                  <div>
                    <h4 className="text-white font-medium group-hover:text-amber-400 transition-colors">
                      {channel.name}
                    </h4>
                    <p className="text-gray-500 text-xs">{channel.grumpCount} grumps</p>
                  </div>
                </div>
                <span className="text-gray-600 group-hover:text-amber-400 transition-colors">→</span>
              </div>
            ))}
          </div>
        </div>

        {/* Latest Grumps */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">Latest Grumps</h2>
          <div className="border border-gray-700 bg-[#111827] rounded-xl p-12 text-center">
            <div className="text-5xl mb-4">🤐</div>
            <h3 className="text-white font-bold text-xl mb-2">No grumps yet</h3>
            <p className="text-gray-400 mb-6">
              Be the first to post a verified pattern or hot take!
            </p>
            <button className="bg-amber-500 hover:bg-amber-600 text-black font-bold px-6 py-3 rounded-xl transition-colors">
              Register to Post
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
