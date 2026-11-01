import type { MetadataRoute } from "next";
import { APP_STORE_NAME, TAGLINE_AR } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#0b1220",
    description: TAGLINE_AR,
    dir: "rtl",
    display: "standalone",
    icons: [
      {
        sizes: "120x120",
        src: "/images/zooka-logo-120.png",
        type: "image/png",
      },
      {
        sizes: "512x512",
        src: "/images/zooka-logo-512.png",
        type: "image/png",
      },
    ],
    lang: "ar",
    name: APP_STORE_NAME,
    short_name: APP_STORE_NAME,
    start_url: "/",
    theme_color: "#0b1220",
  };
}
