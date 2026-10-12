import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // the floating "N" dev-tools badge overlaps the bottom tab bar (Home tab)
  devIndicators: false,
};

export default nextConfig;
