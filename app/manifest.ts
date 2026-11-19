import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/**
 * Installable-app manifest (PWA).
 *
 * Served by Next as /manifest.webmanifest and linked automatically from the
 * document head. It describes only what the app really is today: a chat
 * workspace with Google sign-in. No screenshot, shortcut or capability is
 * declared here unless it exists in the running app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "ZOOKA-AI",
    description: SITE_DESCRIPTION,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    dir: "rtl",
    lang: "ar",
    background_color: "#0f172a",
    theme_color: "#2E86AB",
    categories: ["productivity", "business", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
