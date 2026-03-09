import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "netlas.io",
      },
    ],
  },
};

export default nextConfig;
