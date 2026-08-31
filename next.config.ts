import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nextImagesUnoptimized, nextOutput } from "./src/lib/next-output";

/** Pin the repo, not a parent folder that happens to have a package-lock.json. */
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

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
  typescript: packStatic ? { tsconfigPath: "tsconfig.static.json" } : undefined,
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  devIndicators: false,
  logging: {
    browserToTerminal: false,
  },
  // Static export warns if the `headers` key exists at all, even as `() => []`.
  ...(packStatic
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/((?!api/).*)",
              headers: [
                { key: "Access-Control-Allow-Origin", value: "*" },
                { key: "Cache-Control", value: "no-store" },
              ],
            },
            {
              source: "/api/:path*",
              headers: [{ key: "Cache-Control", value: "no-store" }],
            },
          ];
        },
      }),
};

export default nextConfig;
