import type { Metadata } from "next";
import { SocialHub } from "@/components/social-hub";

const SOCIAL_URL = "https://zooka-ai.com/social";

export const metadata: Metadata = {
  title: "الحسابات الرسمية — ZOOKA-AI",
  description:
    "كل حسابات ZOOKA-AI الرسمية في مكان واحد: الشبكات الاجتماعية، منصات المطورين، المجتمع، والدعم. All official ZOOKA-AI accounts in one place.",
  alternates: { canonical: SOCIAL_URL },
  openGraph: {
    title: "ZOOKA-AI — الحسابات الرسمية",
    description:
      "الشبكات الاجتماعية، منصات المطورين، المجتمع، والدعم — كل قنوات ZOOKA-AI الرسمية.",
    url: SOCIAL_URL,
    siteName: "ZOOKA-AI",
    type: "website",
  },
};

/** Machine-readable list of the accounts we actually own. */
const SAME_AS = [
  "https://zooka-ai.com",
  "https://github.com/ZOOKA-AI",
  "https://github.com/ZOOKA-AI/chatbot",
  "https://www.facebook.com/61596724862442",
  "https://x.com/zooka_ai",
  "https://www.youtube.com/@zooka_ai_official",
  "https://www.linkedin.com/company/zooka-ai/",
  "https://www.tiktok.com/@zooka.ai7",
  "https://www.pinterest.com/zookaai/",
  "https://t.me/zooka_ai_official",
  "https://t.me/zooka_ai_official_bot",
  "https://discord.gg/7ynqJxMZfQ",
  "https://bsky.app/profile/zookaai.bsky.social",
  "https://www.reddit.com/user/Simple-Suggestion-26",
  "https://dev.to/zoka_ai",
];

export default function SocialPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ZOOKA-AI",
    url: "https://zooka-ai.com",
    email: "info@zooka-ai.com",
    description:
      "ZOOKA-AI | Beyond Artificial Intelligence. AI agents, smart automation, software development, image and video studios, and integrations.",
    sameAs: SAME_AS,
  };

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-10 p-6 py-14"
      dir="rtl"
      lang="ar"
    >
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />

      <header className="flex flex-col gap-4 text-center">
        <span className="mx-auto w-fit rounded-full border px-3 py-1 text-muted-foreground text-xs">
          Official Accounts · الحسابات الرسمية
        </span>
        <h1 className="font-semibold text-3xl">حسابات ZOOKA-AI الرسمية</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          منظومة ذكاء اصطناعي تجمع الوكلاء الأذكياء والأتمتة وتطوير البرمجيات
          واستوديوهات الصور والفيديو في منصة واحدة.
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed" dir="ltr">
          ZOOKA-AI | Beyond Artificial Intelligence. AI agents, smart
          automation, software development, image and video studios, and
          integrations.
        </p>
        <p className="mx-auto max-w-xl text-muted-foreground text-xs leading-relaxed">
          هذه القائمة هي المرجع الوحيد للحسابات الرسمية. أي حساب غير مذكور هنا
          لا يمثّل ZOOKA-AI. للتواصل:{" "}
          <a className="underline" href="mailto:info@zooka-ai.com">
            info@zooka-ai.com
          </a>
        </p>
      </header>

      <SocialHub />

      <footer className="border-t pt-6 text-center text-muted-foreground text-xs">
        <p>
          ZOOKA-AI · تقنية بإيمان، تقدّم بأخلاق ·{" "}
          <a className="underline" href="https://zooka-ai.com">
            zooka-ai.com
          </a>
        </p>
      </footer>
    </main>
  );
}
