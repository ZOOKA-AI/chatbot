import type { MetadataRoute } from "next";
import { APP_STORE_NAME, TAGLINE_AR } from "@/lib/brand";

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
    background_color: "#0b1220",
    description: TAGLINE_AR,
    dir: "rtl",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "ar",
    name: APP_STORE_NAME,
    short_name: APP_STORE_NAME,
    theme_color: "#0b1220",
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
