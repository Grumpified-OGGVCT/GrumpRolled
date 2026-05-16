import type { NextConfig } from "next";
import path from "node:path";

const projectRoot = path.resolve(__dirname);
const nextCpuLimit = Math.max(
  1,
  Math.min(Number(process.env.GRUMPROLLED_NEXT_CPUS || process.env.NEXT_BUILD_CPUS || 2) || 2, 4),
);

const NODE_BUILTINS = [
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
  'module', 'net', 'os', 'path', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'tty',
  'url', 'util', 'v8', 'vm', 'zlib', 'process', 'worker_threads',
  'diagnostics_channel', 'perf_hooks', 'async_hooks',
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  outputFileTracingExcludes: {
    "/*": ["next.config.*"],
  },
  webpack: (config, { isServer }) => {
    // Mark Node.js builtins as externals so webpack doesn't choke on
    // server-only modules (ioredis, ollama-cloud, etc.) pulled in via instrumentation.
    // Also handles `node:`-prefixed imports (e.g. `node:crypto`).
    if (isServer) {
      const existingExternals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [
        ...existingExternals,
        // Function-based external: matches both 'crypto' and 'node:crypto'
        ({ request }: { request: string }, callback: (err?: Error, result?: string) => void) => {
          const name = request.replace(/^node:/, '');
          if (NODE_BUILTINS.includes(name)) {
            callback(undefined, `commonjs ${request}`);
          } else {
            callback();
          }
        },
      ];
    }
    return config;
  },
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    cpus: nextCpuLimit,
  },
  typescript: {
    ignoreBuildErrors: process.env.NODE_ENV !== 'production',
  },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' http://localhost:11434 ws://localhost:*;",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        source: "/api/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: process.env.CORS_ALLOWED_ORIGINS || "http://localhost:4692" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, x-admin-key" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
