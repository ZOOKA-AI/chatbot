import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const PUBLIC_PAGES = [
  { changeFrequency: "weekly", path: "/", priority: 1 },
  { changeFrequency: "weekly", path: "/pricing", priority: 0.8 },
  { changeFrequency: "monthly", path: "/about", priority: 0.6 },
  { changeFrequency: "monthly", path: "/partners", priority: 0.7 },
  { changeFrequency: "monthly", path: "/partners/join", priority: 0.7 },
  { changeFrequency: "monthly", path: "/contact", priority: 0.6 },
  { changeFrequency: "monthly", path: "/compare/chatgpt", priority: 0.8 },
  { changeFrequency: "yearly", path: "/privacy", priority: 0.4 },
  { changeFrequency: "yearly", path: "/terms", priority: 0.4 },
  { changeFrequency: "yearly", path: "/refund", priority: 0.4 },
  { changeFrequency: "yearly", path: "/cookies", priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map(({ changeFrequency, path, priority }) => ({
    changeFrequency,
    priority,
    url: `${SITE_URL}${path === "/" ? "" : path}`,
  }));
}
