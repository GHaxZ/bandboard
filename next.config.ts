import type { NextConfig } from "next";

// Keep in sync with UPLOAD_LIMITS.proxyCap in src/lib/constants.ts.
const PROXY_BODY_CAP = "250mb";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    proxyClientMaxBodySize: PROXY_BODY_CAP,
  },
};

export default nextConfig;