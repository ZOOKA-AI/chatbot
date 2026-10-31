import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { renderMarkdown } from "@/lib/blog/markdown";
import { getPublishedPost, listPublishedPosts } from "@/lib/blog/store";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 60;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return { title: "Article not found" };

  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    keywords: post.keyword ? [post.keyword] : undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description: post.excerpt ?? undefined,
      publishedTime: post.publishedAt,
      siteName: SITE_NAME,
      locale: post.lang === "ar" ? "ar_AR" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt ?? undefined,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const uiLang = await getLang();
  const ar = uiLang === "ar";
  const all = await listPublishedPosts(60);
  const related = all.filter((item) => item.slug !== post.slug).slice(0, 3);

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${post.slug}` },
    headline: post.title,
    description: post.excerpt ?? undefined,
    inLanguage: post.lang,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: { "@type": "Organization", name: post.author ?? SITE_NAME, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icon` },
    },
    ...(post.keyword ? { keywords: post.keyword } : {}),
  };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Zooka AI", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: `${SITE_URL}/blog/${post.slug}` },
    ],
  };

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 p-6 py-16"
      dir={dirOf(post.lang)}
      lang={post.lang}
      style={{ fontFamily: fontOf(post.lang) }}
    >
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD payload
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD payload
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      <nav className="text-muted-foreground text-sm">
        <Link href="/blog" className="hover:underline">
          {ar ? "مدونة زوكا" : "Zooka Blog"}
        </Link>
        <span className="mx-2">/</span>
        <span>{post.lang === "ar" ? "مقال" : "Article"}</span>
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="font-semibold text-3xl leading-tight">{post.title}</h1>
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
          <time dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString(post.lang === "ar" ? "ar-AE" : "en-GB", {
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </time>
          <span>·</span>
          <span>{post.author ?? SITE_NAME}</span>
          {post.keyword && (
            <>
              <span>·</span>
              <span className="rounded-full border px-2 py-0.5 text-xs">{post.keyword}</span>
            </>
          )}
        </div>
      </header>

      <article className="flex flex-col gap-4 text-[0.95rem] leading-7">
        {renderMarkdown(post.body)}
      </article>

      <aside className="flex flex-col gap-3 rounded-2xl border p-5">
        <h2 className="font-semibold text-lg">
          {ar ? "جرّب زوكا على مهمة حقيقية" : "Try Zooka on a real task"}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {ar
            ? "التجربة المجانية تكتب فقط. ربط جيميل ودرايف وجيت هب ووضع الوكيل يبدأ من باقة الاحترافي."
            : "The free preview writes only. Gmail, Drive, GitHub connections and agent mode start on the Pro plan."}
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
            {ar ? "ابدأ مجاناً" : "Start free"}
          </Link>
          <Link href="/pricing" className="text-muted-foreground px-2 py-2 hover:underline">
            {ar ? "الأسعار" : "Pricing"}
          </Link>
        </div>
      </aside>

      {related.length > 0 && (
        <section className="flex flex-col gap-3 border-t pt-6">
          <h2 className="font-semibold text-lg">{ar ? "اقرأ أيضاً" : "Read next"}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {related.map((item) => (
              <li key={item.slug}>
                <Link href={`/blog/${item.slug}`} className="hover:underline">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
