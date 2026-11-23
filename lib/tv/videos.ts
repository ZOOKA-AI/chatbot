/**
 * ZOOKA AI TV — the one catalog of videos the site may show.
 *
 * Rules this module enforces (and tests/unit/tv-videos.test.ts checks):
 * - Only videos ZOOKA-AI owns or is licensed to show. No third-party clips.
 * - A video is "published" only when it is actually published at its source.
 *   A file we produced but nobody has approved yet is "review" and is hidden
 *   on production; previews show it with a visible "draft" badge.
 * - Platform categories without a real video render an empty state instead of
 *   a placeholder that pretends to be content.
 *
 * Adding a video is a data change in this file (one object); no page code
 * changes. A database-backed admin editor is specified in
 * docs/experience-2/ZOOKA-AI-TV-SPEC.md and needs a migration approval first.
 */

export type VideoPlatform =
  | "site"
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "x";

export type VideoCategory =
  | "featured"
  | "tutorials"
  | "product-updates"
  | "ai-news"
  | "developer"
  | "community";

export type VideoVisibility = "published" | "review" | "hidden";

export type VideoVerification = "owned-file" | "verified-embed" | "unverified";

export interface TvVideo {
  id: string;
  title: { ar: string; en: string };
  description: { ar: string; en: string };
  platform: VideoPlatform;
  /** Where the video lives: a same-origin file or the official platform URL. */
  sourceUrl: string;
  thumbnail: string;
  /** Seconds. */
  duration: number;
  width: number;
  height: number;
  language: "ar" | "en" | "none";
  category: VideoCategory;
  /** ISO date; for "review" items this is the production date. */
  publishDate: string;
  featured: boolean;
  visibility: VideoVisibility;
  verification: VideoVerification;
  captions?: { ar?: string; en?: string };
  /** Alternate renditions, e.g. the vertical cut for phones. */
  vertical?: string;
  /** Same video with English visuals and English voice-over (landscape). */
  englishVersion?: string;
  /** Vertical cut of the English version. */
  englishVertical?: string;
}

export const TV_VIDEOS: TvVideo[] = [
  {
    id: "meet-zooka-ai",
    title: { ar: "تعرّف على ZOOKA-AI", en: "Meet ZOOKA-AI" },
    description: {
      ar: "جولة قصيرة: المحادثة، الوكلاء، التكاملات، الأتمتة، وأدوات المطورين — كما هي في المنصة اليوم.",
      en: "A short tour of chat, agents, integrations, automation and developer tools, as they exist in the product today.",
    },
    platform: "site",
    sourceUrl: "/videos/brand/meet-zooka-ai-1920x1080.mp4",
    vertical: "/videos/brand/meet-zooka-ai-1080x1920.mp4",
    englishVersion: "/videos/brand/meet-zooka-ai-en-1920x1080.mp4",
    englishVertical: "/videos/brand/meet-zooka-ai-en-1080x1920.mp4",
    thumbnail: "/videos/brand/meet-zooka-ai-thumb.jpg",
    duration: 40,
    width: 1920,
    height: 1080,
    language: "ar",
    category: "featured",
    publishDate: "2026-11-22",
    featured: true,
    visibility: "published",
    verification: "owned-file",
    captions: {
      ar: "/videos/captions/meet-zooka-ai.ar.vtt",
      en: "/videos/captions/meet-zooka-ai.en.vtt",
    },
  },
  {
    id: "build-with-zooka-ai",
    title: {
      ar: "ماذا يمكنك أن تبني مع ZOOKA-AI؟",
      en: "What can you build with ZOOKA-AI?",
    },
    description: {
      ar: "من إنشاء وكيل وربط أداة، إلى تنفيذ المهمة ومراجعة النتيجة قبل الإرسال، ثم ربط المطور عبر API وMCP.",
      en: "Create an agent, connect a tool, run the task, review the result before anything is sent, then connect as a developer through the API and MCP.",
    },
    platform: "site",
    sourceUrl: "/videos/brand/build-with-zooka-ai-1920x1080.mp4",
    vertical: "/videos/brand/build-with-zooka-ai-1080x1920.mp4",
    englishVersion: "/videos/brand/build-with-zooka-ai-en-1920x1080.mp4",
    englishVertical: "/videos/brand/build-with-zooka-ai-en-1080x1920.mp4",
    thumbnail: "/videos/brand/build-with-zooka-ai-thumb.jpg",
    duration: 50,
    width: 1920,
    height: 1080,
    language: "ar",
    category: "tutorials",
    publishDate: "2026-11-22",
    featured: false,
    visibility: "published",
    verification: "owned-file",
    captions: {
      ar: "/videos/captions/build-with-zooka-ai.ar.vtt",
      en: "/videos/captions/build-with-zooka-ai.en.vtt",
    },
  },
  {
    id: "zooka-demo",
    title: { ar: "زوكا AI في 28 ثانية", en: "Zooka AI in 28 seconds" },
    description: {
      ar: "ربط الأدوات بعد موافقتك، التنفيذ خطوة بخطوة، التكاملات، المحادثة الصوتية، والنشر على فيرسل.",
      en: "Connecting tools with your consent, step-by-step execution, integrations, voice chat and deploying to Vercel.",
    },
    platform: "site",
    sourceUrl: "/videos/zooka-demo.mp4",
    thumbnail: "/images/zooka-demo-poster.png",
    duration: 28,
    width: 1280,
    height: 720,
    language: "none",
    category: "product-updates",
    publishDate: "2026-10-31",
    featured: false,
    visibility: "published",
    verification: "owned-file",
  },
  {
    id: "zk-brand-intro",
    title: {
      ar: "هوية ZOOKA-AI في 5 ثوانٍ",
      en: "The ZOOKA-AI identity in 5 seconds",
    },
    description: {
      ar: "المقطع الرسمي للهوية: السداسي، والتدرّج المعتمد، والشعار العربي.",
      en: "The official identity sting: the hexagon mark, the approved gradient and the Arabic wordmark.",
    },
    platform: "site",
    sourceUrl: "/videos/brand/zk-intro-1080x1920.mp4",
    thumbnail: "/videos/brand/zk-intro-poster.jpg",
    duration: 5,
    width: 1080,
    height: 1920,
    language: "none",
    category: "community",
    publishDate: "2026-11-21",
    featured: false,
    visibility: "published",
    verification: "owned-file",
  },
];

export const TV_CATEGORIES: {
  id: VideoCategory;
  ar: string;
  en: string;
}[] = [
  { id: "featured", ar: "المميّز", en: "Featured" },
  { id: "tutorials", ar: "شروحات", en: "Tutorials" },
  { id: "product-updates", ar: "تحديثات المنتج", en: "Product updates" },
  { id: "ai-news", ar: "أخبار الذكاء الاصطناعي", en: "AI news" },
  { id: "developer", ar: "للمطورين", en: "Developer content" },
  { id: "community", ar: "المجتمع", en: "Community" },
];

/** Production hides "review" items; previews and local builds show them. */
export function isProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function visibleVideos(
  videos: TvVideo[] = TV_VIDEOS,
  production: boolean = isProductionDeploy()
): TvVideo[] {
  return videos
    .filter((video) =>
      production
        ? video.visibility === "published"
        : video.visibility !== "hidden"
    )
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate));
}

export function featuredVideo(videos: TvVideo[]): TvVideo | undefined {
  return videos.find((video) => video.featured) ?? videos[0];
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** ISO 8601 duration for VideoObject structured data. */
export function isoDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `PT${m}M${s}S` : `PT${s}S`;
}
