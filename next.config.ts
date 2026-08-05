import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Stamped at build time; shown in the page footer to identify the build
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
