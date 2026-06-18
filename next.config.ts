import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_DEPLOY_SHA:
      process.env.CF_PAGES_COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      "dev",
  },
};

export default nextConfig;
