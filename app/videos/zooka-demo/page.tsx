import type { Metadata } from "next";
import Link from "next/link";

import { SITE_NAME, SITE_URL } from "@/lib/site";

const VIDEO = {
  contentUrl: `${SITE_URL}/videos/zooka-demo.mp4`,
  description:
    "عرض سريع بالعربي لزوكا AI: ربط الأدوات بعد موافقتك، تنفيذ المهام خطوة بخطوة، التكاملات، المحادثة الصوتية، والنشر على فيرسل.",
  duration: "PT28S",
  name: "زوكا AI — فيديو تعريفي",
  nameEn: "Zooka AI demo video",
  poster: `${SITE_URL}/images/zooka-demo-poster.png`,
  uploadDate: "2026-10-31T09:00:00+04:00",
  url: `${SITE_URL}/videos/zooka-demo`,
};

export const metadata: Metadata = {
  title: "فيديو تعريفي — زوكا AI في 28 ثانية",
  description: VIDEO.description,
  alternates: { canonical: "/videos/zooka-demo" },
  openGraph: {
    type: "video.other",
    url: "/videos/zooka-demo",
    title: "فيديو تعريفي — زوكا AI في 28 ثانية",
    description: VIDEO.description,
    videos: [
      {
        url: VIDEO.contentUrl,
        secureUrl: VIDEO.contentUrl,
        type: "video/mp4",
        width: 1280,
        height: 720,
      },
    ],
    images: [{ url: "/images/zooka-demo-poster.png", alt: "Zooka AI demo" }],
  },
};

const HIGHLIGHTS = [
  "بدون صوت — يتشغّل في أي مكان",
  "يشرح القدرات الستة الأساسية",
  "كل شاشة فيه موجودة فعلًا في التطبيق",
];

export default function DemoVideoPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "VideoObject",
        name: VIDEO.name,
        alternateName: VIDEO.nameEn,
        description: VIDEO.description,
        thumbnailUrl: [VIDEO.poster],
        uploadDate: VIDEO.uploadDate,
        duration: VIDEO.duration,
        contentUrl: VIDEO.contentUrl,
        embedUrl: VIDEO.url,
        url: VIDEO.url,
        inLanguage: "ar",
        isFamilyFriendly: true,
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          url: SITE_URL,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE_URL },
          {
            "@type": "ListItem",
            position: 2,
            name: "فيديو تعريفي",
            item: VIDEO.url,
          },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-14">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />

      <nav aria-label="مسار التنقل" className="text-muted-foreground text-sm">
        <Link className="hover:text-foreground" href="/">
          الرئيسية
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">فيديو تعريفي</span>
      </nav>

      <header className="mt-6">
        <span className="text-emerald-500 text-xs uppercase tracking-widest">
          فيديو تعريفي
        </span>
        <h1 className="mt-2 font-semibold text-3xl sm:text-4xl">
          28 ثانية تشوف فيها زوكا AI وهو بيعمل الشغل
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          عرض سريع بالعربي: من ربط الحساب، لتنفيذ خطوة بخطوة، للتكاملات، للمحادثة
          الصوتية، للنشر على فيرسل. مفيش كلام مبالغ — كل شاشة موجودة فعلًا في
          التطبيق.
        </p>
      </header>

      <div className="mt-8 overflow-hidden rounded-2xl border bg-black shadow-xl">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          className="aspect-video w-full"
          controls
          loop
          muted
          playsInline
          poster="/images/zooka-demo-poster.png"
          preload="metadata"
          src="/videos/zooka-demo.mp4"
        />
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {HIGHLIGHTS.map((item) => (
          <div className="rounded-xl border p-4 text-sm" key={item}>
            {item}
          </div>
        ))}
      </section>

      <section className="mt-10 flex flex-wrap gap-3">
        <Link
          className="rounded-lg bg-foreground px-6 py-3 font-medium text-background"
          href="/register"
        >
          ابدأ مجانًا
        </Link>
        <Link className="rounded-lg border px-6 py-3 font-medium" href="/pricing">
          الأسعار
        </Link>
        <Link className="rounded-lg border px-6 py-3 font-medium" href="/contact">
          تحدث مع الفريق
        </Link>
      </section>
    </main>
  );
}
