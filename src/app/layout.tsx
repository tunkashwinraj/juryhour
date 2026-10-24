import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL;

export const metadata: Metadata = {
  ...(appUrl ? { metadataBase: new URL(appUrl) } : {}),
  title: {
    default: "JuryHour: real buyers, real verdict, before you launch",
    template: "%s · JuryHour",
  },
  description:
    "Paste your landing page. Real people who match your buyer judge it against an AI rewrite and tell you which one wins. From $11, same day. Directional signal from real people, not a sales guarantee.",
  openGraph: {
    title: "JuryHour: real buyers, real verdict, before you launch",
    description: "Before you spend $1,000 on ads, spend $11 to see if real people get your page.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#FBFBFC",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
