import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/pricing", "/login", "/register", "/privacy", "/terms"].map(
    (path) => ({
      url: `${SITE_URL}${path === "/" ? "" : path}`,
      changeFrequency:
        path === "/" || path === "/pricing" ? "weekly" : "monthly",
      priority: path === "/" ? 1 : 0.7,
    })
  );
}
