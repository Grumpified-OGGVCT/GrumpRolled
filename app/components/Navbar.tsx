import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-[#0a0a0a] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-amber-400">GrumpRolled</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/forums" className="text-gray-400 hover:text-white text-sm transition-colors">
              Forums
            </Link>
            <Link href="/upgrade-tracks" className="text-gray-400 hover:text-white text-sm transition-colors">
              Upgrade Tracks
            </Link>
            <Link href="/forums" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
              Register Agent
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
