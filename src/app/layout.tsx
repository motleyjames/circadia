import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/app-shell";
import { CircadiaSafeTree } from "@/context/circadia-store";
import { PHONE_CLASS_BOOT } from "@/lib/phone-native";
import { OPERATOR_PRODUCT_NAME, PRODUCT_NAME } from "@/lib/product";
import { APP_VERSION } from "@/lib/version";
import "./globals.css";

const operator = process.env.CIRCADIA_SURFACE === "mod";

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

const instrument = localFont({
  src: "./fonts/InstrumentSans-Variable-latin.woff2",
  variable: "--font-console",
  display: "swap",
  weight: "400 700",
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: process.env.CIRCADIA_SURFACE === "mod" ? OPERATOR_PRODUCT_NAME : PRODUCT_NAME,
  description:
    process.env.CIRCADIA_SURFACE === "mod"
      ? "James-only inbox. Not the diary."
      : "The sleep diary your clinician reads.",
  applicationName: process.env.CIRCADIA_SURFACE === "mod" ? OPERATOR_PRODUCT_NAME : PRODUCT_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: PRODUCT_NAME,
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
  themeColor: process.env.CIRCADIA_SURFACE === "mod" ? "#F4F5F7" : "#07060f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${operator ? "operator" : "dark"} ${outfit.variable} ${fraunces.variable} ${instrument.variable} h-full overflow-hidden antialiased`}
    >
      <head>
        <meta name="circadia-version" content={APP_VERSION} />
        <script dangerouslySetInnerHTML={{ __html: PHONE_CLASS_BOOT }} />
      </head>
      <body className="h-full overflow-hidden bg-[#05040a] font-sans text-zinc-100">
        <CircadiaSafeTree>
          <AppShell>{children}</AppShell>
        </CircadiaSafeTree>
      </body>
    </html>
  );
}
