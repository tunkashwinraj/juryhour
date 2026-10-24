import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/styles/fonts";
import "@/styles/tokens.css";
import "./globals.css";
import "@/components/ui/ui.css";
import { SiteAnalytics } from "@/components/ui/SiteAnalytics";

const appUrl = process.env.NEXT_PUBLIC_APP_URL;

// Default metadata stays minimal: marketing pages set their own via pageMetadata() from @/lib/seo
// (canonical, OG image, description). No canonical here, so pages without one don't inherit "/".
export const metadata: Metadata = {
  ...(appUrl ? { metadataBase: new URL(appUrl) } : {}),
  title: {
    default: "JuryHour: real buyers, real verdict, before you launch",
    template: "%s · JuryHour",
  },
  description:
    "Paste your landing page. Real people who match your buyer judge it against an AI rewrite and tell you which one wins. From $49, same day. Directional signal from real people, not a sales guarantee.",
  openGraph: {
    title: "JuryHour: real buyers, real verdict, before you launch",
    description: "Before you spend $1,000 on ads, spend $49 to see if real people get your page.",
    type: "website",
    siteName: "JuryHour",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f8" },
    { media: "(prefers-color-scheme: dark)", color: "#14213d" },
  ],
  colorScheme: "light dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        {children}
        {/* @vercel/analytics <Analytics /> with private-link tokens stripped (beforeSend) */}
        <SiteAnalytics />
      </body>
    </html>
  );
}
