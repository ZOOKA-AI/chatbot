import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { listPublishedPosts } from "@/lib/blog/store";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "المدونة | Blog",
  description:
    "مقالات Zooka AI عن تشغيل الأعمال بالذكاء الاصطناعي: ربط البريد وجوجل درايف وجيت هب وأتمتة المهام اليومية. Zooka AI blog on running a business with AI agents.",
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/blog`,
    title: `المدونة | ${SITE_NAME}`,
    description: "مقالات عن أتمتة الأعمال بالذكاء الاصطناعي مع Zooka AI.",
  },
};

function formatDate(iso: string, ar: boolean) {
  try {
    return new Date(iso).toLocaleDateString(ar ? "ar-AE" : "en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

async function BlogIndexContent() {
  const lang = await getLang();
  const ar = lang === "ar";
  const posts = await listPublishedPosts(60);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${SITE_NAME} Blog`,
    url: `${SITE_URL}/blog`,
    inLanguage: ["ar", "en"],
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    blogPost: posts.slice(0, 20).map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${SITE_URL}/blog/${post.slug}`,
      datePublished: post.publishedAt,
      inLanguage: post.lang,
    })),
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: posts.slice(0, 20).map((post, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/blog/${post.slug}`,
      name: post.title,
    })),
  };

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-10 p-6 py-16"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD payload
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {posts.length > 0 && (
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD payload
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
        />
      )}

      <header className="flex flex-col gap-3">
        <Link href="/" className="text-muted-foreground text-sm hover:underline">
          {ar ? "← رجوع إلى زوكا" : "← Back to Zooka"}
        </Link>
        <h1 className="font-semibold text-3xl">{ar ? "مدونة زوكا" : "Zooka Blog"}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {ar
            ? "كيف تشغّل شركتك بمساعد ذكي ينفّذ المهام فعلاً: البريد، الملفات، التقويم، الكود، والأتمتة. مقالات عملية بدون حشو."
            : "How to run your business with an assistant that actually executes: email, files, calendar, code, and automation. Practical posts, no filler."}
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {ar ? "لا توجد مقالات منشورة بعد." : "No published posts yet."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {posts.map((post) => (
            <li key={post.slug} className="py-5 first:pt-0">
              <Link href={`/blog/${post.slug}`} className="group flex flex-col gap-2">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <span className="rounded-full border px-2 py-0.5">
                    {post.lang === "ar" ? "عربي" : "English"}
                  </span>
                  <time dateTime={post.publishedAt}>
                    {formatDate(post.publishedAt, post.lang === "ar")}
                  </time>
                </div>
                <h2 className="font-semibold text-xl group-hover:underline">
                  {post.title}
                </h2>
                {post.excerpt && (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {post.excerpt}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <footer className="flex flex-wrap items-center gap-3 border-t pt-6 text-sm">
        <Link href="/register" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
          {ar ? "أنشئ مساحة عملك" : "Create your workspace"}
        </Link>
        <Link href="/pricing" className="text-muted-foreground hover:underline">
          {ar ? "الأسعار" : "Pricing"}
        </Link>
        <Link href="/compare/chatgpt" className="text-muted-foreground hover:underline">
          {ar ? "زوكا مقابل ChatGPT" : "Zooka vs ChatGPT"}
        </Link>
      </footer>
    </main>
  );
}

export default function BlogIndexPage() {
  // The post list is read per request, so it must sit inside a Suspense
  // boundary for the route to prerender its static shell.
  return (
    <Suspense fallback={<div className="mx-auto min-h-dvh w-full max-w-3xl p-6 py-16" />}>
      <BlogIndexContent />
    </Suspense>
  );
}
