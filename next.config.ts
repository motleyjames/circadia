import type { NextConfig } from "next";

const electron = process.env.CIRCADIA_ELECTRON === "1";

const nextConfig: NextConfig = {
  output: electron ? "export" : "standalone",
  images: electron ? { unoptimized: true } : undefined,
  devIndicators: false,
  logging: {
    browserToTerminal: false,
  },
  async headers() {
    if (electron) return [];
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
