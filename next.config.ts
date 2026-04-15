import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  turbopack: {
    root: "C:\\Users\\gerry\\generic_workspace\\GrumpRolled",
  },
};

export default nextConfig;
