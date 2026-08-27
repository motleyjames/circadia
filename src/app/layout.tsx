import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${outfit.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#05040a] font-sans text-zinc-100">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
