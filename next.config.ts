import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;