import type { MetadataRoute } from "next";
import { listPublishedPosts } from "@/lib/blog/store";
import { SITE_URL } from "@/lib/site";

const PUBLIC_PAGES = [
  { changeFrequency: "weekly", path: "/", priority: 1 },
  { changeFrequency: "weekly", path: "/blog", priority: 0.8 },
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = PUBLIC_PAGES.map(
    ({ changeFrequency, path, priority }) => ({
      changeFrequency,
      priority,
      url: `${SITE_URL}${path === "/" ? "" : path}`,
    })
  );

  // A database hiccup must never break the sitemap; posts are simply omitted.
  const posts = await listPublishedPosts(200);
  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.publishedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...postEntries];
}
