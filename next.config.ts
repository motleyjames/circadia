import type { NextConfig } from "next";
import { nextImagesUnoptimized, nextOutput } from "./src/lib/next-output";

const env = {
  CIRCADIA_PACK_STATIC: process.env.CIRCADIA_PACK_STATIC,
  CIRCADIA_ELECTRON: process.env.CIRCADIA_ELECTRON,
  CIRCADIA_SURFACE: process.env.CIRCADIA_SURFACE,
  NEXT_PUBLIC_CIRCADIA_SURFACE: process.env.NEXT_PUBLIC_CIRCADIA_SURFACE,
};

const operator =
  process.env.CIRCADIA_SURFACE === "mod" || process.env.NEXT_PUBLIC_CIRCADIA_SURFACE === "mod";
const packStatic = nextOutput(env) === "export";

const nextConfig: NextConfig = {
  distDir: operator ? ".next-mod" : ".next",
  output: nextOutput(env),
  images: nextImagesUnoptimized(env) ? { unoptimized: true } : undefined,
  devIndicators: false,
  logging: {
    browserToTerminal: false,
  },
  async headers() {
    if (packStatic) return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
