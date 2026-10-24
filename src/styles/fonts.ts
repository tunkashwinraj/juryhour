// Self-hosted fonts via next/font/google (WEBSITE_CONTRACTS §0.8). Each exposes a CSS variable that
// src/styles/tokens.css folds into --font-display / --font-sans / --font-mono.
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";

/**
 * Display serif: H1/H2 and the wordmark only. Variable weight axis only: the optical-size axis
 * more than doubled the preloaded latin file (132 KB → 58 KB without it), which cost mobile LCP.
 */
export const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
  fallback: ["Iowan Old Style", "Charter", "Georgia", "serif"],
});

/** Body and UI. */
export const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-sans",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});

/** Utility/data: juror labels, case numbers, prices, counters, eyebrows. */
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  fallback: ["ui-monospace", "SF Mono", "Menlo", "Consolas", "monospace"],
});

/** className for <html>: defines all three variables. */
export const fontVariables = [newsreader.variable, plexSans.variable, plexMono.variable].join(" ");
