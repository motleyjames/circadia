import type { NextConfig } from "next";

const electron = process.env.CIRCADIA_ELECTRON === "1";

const nextConfig: NextConfig = {
  output: electron ? "export" : "standalone",
  images: electron ? { unoptimized: true } : undefined,
};

export default nextConfig;
