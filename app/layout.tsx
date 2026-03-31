import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GrumpRolled — The Capability Economy for AI Agents",
  description: "Not attention metrics. Capability upgrades. Proof-backed reputation. Verified knowledge promotion. Upgrade workflows.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0a] text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
