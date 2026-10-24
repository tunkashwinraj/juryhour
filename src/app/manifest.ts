// Web app manifest (Next.js metadata file convention). Colors and icons from the founder's brand kit
// (public/brand/README.md): Ink #14213D, Paper #EEF2F8; icons are the kit's app icons.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JuryHour",
    short_name: "JuryHour",
    description: "Real people who match your buyer judge your landing page against an AI rewrite.",
    start_url: "/",
    display: "standalone",
    background_color: "#EEF2F8",
    theme_color: "#14213D",
    icons: [
      { src: "/brand/web/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/web/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
