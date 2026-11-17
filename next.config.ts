import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "100mb" },
  },
  images: { unoptimized: true },
};

export default nextConfig;
