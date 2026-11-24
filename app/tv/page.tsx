import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SocialIconRow } from "@/components/social-icon-row";
import { TvPlayer } from "@/components/tv/tv-player";
import { VideoStream } from "@/components/tv/video-stream";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import {
  featuredVideo,
  isoDuration,
  TV_CATEGORIES,
  visibleVideos,
} from "@/lib/tv/videos";

export const metadata: Metadata = {
  title: "ZOOKA-AI TV — فيديوهات المنصة",
  description:
    "قناة فيديو ZOOKA-AI: جولات المنتج، الشروحات، وتحديثات المنصة. ZOOKA-AI TV: product tours, tutorials and platform updates.",
  alternates: { canonical: "/tv" },
  openGraph: {
    title: "ZOOKA-AI TV",
    description: "جولات المنتج، الشروحات، وتحديثات المنصة.",
    url: `${SITE_URL}/tv`,
    type: "website",
    images: [{ url: "/images/zooka-demo-poster.png", alt: "ZOOKA-AI TV" }],
  },
};

type TvSearchParams = Promise<{ v?: string; c?: string }>;

export default function TvPage({
  searchParams,
}: {
  searchParams: TvSearchParams;
}) {
  // The language cookie and the query string are request data, so the shell stays static and
  // the channel streams in (required by cacheComponents).
  return (
    <Suspense fallback={null}>
      <TvContent searchParams={searchParams} />
    </Suspense>
  );
}

async function TvContent({ searchParams }: { searchParams: TvSearchParams }) {
  const [{ v, c }, lang] = await Promise.all([searchParams, getLang()]);
  const ar = lang === "ar";
  const videos = visibleVideos();
  const current =
    videos.find((video) => video.id === v) ?? featuredVideo(videos);
  const activeCategory = TV_CATEGORIES.find((cat) => cat.id === c)?.id;
  const listed = activeCategory
    ? videos.filter((video) => video.category === activeCategory)
    : videos;

  const jsonLd = videos
    .filter((video) => video.visibility === "published")
    .map((video) => ({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: video.title.ar,
      alternateName: video.title.en,
      description: video.description.ar,
      thumbnailUrl: `${SITE_URL}${video.thumbnail}`,
      contentUrl: `${SITE_URL}${video.sourceUrl}`,
      uploadDate: video.publishDate,
      duration: isoDuration(video.duration),
      publisher: { "@id": `${SITE_URL}/#organization` },
    }));

  return (
    <div dir={dirOf(lang)} lang={lang} style={{ fontFamily: fontOf(lang) }}>
      <SiteHeader lang={lang} />
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 py-12">
        <header className="flex flex-col gap-3">
          <span className="border-border text-muted-foreground w-fit rounded-full border px-3 py-1 font-mono text-xs tracking-[0.18em]">
            ZOOKA-AI TV
          </span>
          <h1 className="text-3xl font-semibold md:text-4xl">
            {ar ? "شاهد المنصة وهي تعمل" : "Watch the platform at work"}
          </h1>
          <p className="text-muted-foreground max-w-2xl leading-relaxed">
            {ar
              ? "جولات قصيرة وشروحات من داخل ZOOKA-AI. كل فيديو هنا من إنتاجنا ويعرض ما هو موجود فعلًا في المنتج."
              : "Short tours and tutorials from inside ZOOKA-AI. Every video here is ours and shows what actually exists in the product."}
          </p>
        </header>

        {current ? (
          <TvPlayer lang={lang} video={current} />
        ) : (
          <EmptyChannel ar={ar} />
        )}

        <nav
          aria-label={ar ? "تصنيفات الفيديو" : "Video categories"}
          className="flex flex-wrap gap-2"
        >
          <CategoryLink active={!activeCategory} href="/tv">
            {ar ? "الكل" : "All"}
          </CategoryLink>
          {TV_CATEGORIES.map((cat) => (
            <CategoryLink
              active={activeCategory === cat.id}
              href={`/tv?c=${cat.id}`}
              key={cat.id}
            >
              {ar ? cat.ar : cat.en}
            </CategoryLink>
          ))}
        </nav>

        {listed.length > 0 ? (
          <VideoStream lang={lang} videos={listed} />
        ) : (
          <EmptyChannel ar={ar} />
        )}

        <section className="border-border flex flex-col gap-4 rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">
            {ar ? "تابع القناة على المنصات" : "Follow the channel"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {ar
              ? "قناة YouTube الرسمية جاهزة ولم يُنشر عليها فيديو بعد. ننشر الفيديوهات هناك بعد مراجعتها."
              : "The official YouTube channel is live with no published videos yet. Videos go there once they are reviewed."}
          </p>
          <SocialIconRow
            ids={["youtube", "tiktok", "x", "telegram", "linkedin"]}
            lang={lang}
          />
        </section>
      </main>
    </div>
  );
}

function CategoryLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`focus-visible:ring-ring inline-flex min-h-10 items-center rounded-full border px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none ${active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
      href={href}
      scroll={false}
    >
      {children}
    </Link>
  );
}

function EmptyChannel({ ar }: { ar: boolean }) {
  return (
    <div className="border-border flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
      <p className="text-muted-foreground font-mono text-xs tracking-[0.2em]">
        ZOOKA-AI TV
      </p>
      <h2 className="text-2xl font-semibold">
        {ar ? "قريبًا على ZOOKA-AI TV" : "Coming soon to ZOOKA-AI TV"}
      </h2>
      <p className="text-muted-foreground max-w-md text-sm">
        {ar
          ? "لا توجد فيديوهات منشورة في هذا التصنيف بعد. اشترك في القناة لتصلك الفيديوهات الجديدة."
          : "No published videos in this category yet. Subscribe to get new videos."}
      </p>
      <a
        className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-medium"
        href="https://www.youtube.com/@zooka_ai_official?sub_confirmation=1"
        rel="noopener noreferrer"
        target="_blank"
      >
        {ar ? "اشترك في القناة" : "Subscribe on YouTube"}
      </a>
    </div>
  );
}
