import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output so the Docker image ships only the compiled server,
  // not node_modules — see frontend/Dockerfile.
  output: "standalone",
};

export default nextConfig;
