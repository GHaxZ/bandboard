import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Runtime files must never be packaged into the standalone application.
  outputFileTracingExcludes: {
    '/*': ['./.env*', './*.db*', './uploads/**/*', './data/**/*', './backups/**/*', './.git/**/*'],
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],

};

export default nextConfig;
