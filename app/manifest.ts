import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#0b1220",
    description:
      "مساعد أعمال ذكي لإدارة العمل والبحث والمحتوى والمحادثات في مساحة عمل واحدة.",
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
    name: "Zooka AI — مساعد الأعمال الذكي",
    short_name: "Zooka AI",
    start_url: "/",
    theme_color: "#0b1220",
  };
}
