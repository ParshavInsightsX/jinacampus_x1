import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Manrope, Nunito_Sans } from "next/font/google";

import { JINACAMPUS_BRAND } from "@/config/brand";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const nunitoSans = Nunito_Sans({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  applicationName: "JinaCampus",
  title: {
    default: `${JINACAMPUS_BRAND.name} - ${JINACAMPUS_BRAND.tagline}`,
    template: `%s | ${JINACAMPUS_BRAND.name}`
  },
  description: JINACAMPUS_BRAND.description,
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" }
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    title: "JinaCampus",
    statusBarStyle: "default"
  },
  other: {
    "msapplication-TileColor": JINACAMPUS_BRAND.colors.deepInk
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: JINACAMPUS_BRAND.colors.deepInk
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Browser extensions can annotate the document root before React hydrates.
  // Keep suppression at this boundary so application subtree mismatches still surface.
  return (
    <html lang="en" className={`${manrope.variable} ${nunitoSans.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
