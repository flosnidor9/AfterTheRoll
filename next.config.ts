import type { NextConfig } from "next";

const isProdBuild = process.env.NODE_ENV === "production";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/AfterTheRoll";

const nextConfig: NextConfig = {
  output: isProdBuild ? "export" : undefined,
  basePath: isProdBuild && basePath ? basePath : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "unavatar.io" },
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
    ],
  },
};

export default nextConfig;
