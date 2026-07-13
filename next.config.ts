import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;