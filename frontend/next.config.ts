import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Hide the Next.js badge in the bottom-left corner during development.
  // Build and runtime errors are still shown when they happen.
  devIndicators: false,
};

export default nextConfig;
