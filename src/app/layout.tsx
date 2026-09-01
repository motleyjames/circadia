import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/app-shell";
import { CircadiaSafeTree } from "@/context/circadia-store";
import "./globals.css";

const outfit = localFont({
  src: "./fonts/Outfit-Variable-latin.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
  adjustFontFallback: "Arial",
});

const fraunces = localFont({
  src: "./fonts/Fraunces-Variable-latin.woff2",
  variable: "--font-heading",
  display: "swap",
  weight: "100 900",
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: process.env.CIRCADIA_SURFACE === "mod" ? "Circadia Operator" : "Circadia",
  description:
    process.env.CIRCADIA_SURFACE === "mod"
      ? "James-only inbox. Not the diary."
      : "A local sleep companion for falling asleep, staying asleep, and holding a schedule.",
  applicationName: process.env.CIRCADIA_SURFACE === "mod" ? "Circadia Operator" : "Circadia",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Circadia",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#07060f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${outfit.variable} ${fraunces.variable} h-full overflow-hidden antialiased`}>
      <body className="h-full overflow-hidden bg-[#05040a] font-sans text-zinc-100">
        <CircadiaSafeTree>
          <AppShell>{children}</AppShell>
        </CircadiaSafeTree>
      </body>
    </html>
  );
}
