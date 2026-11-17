import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  images: { unoptimized: true },
};

export default nextConfig;
