import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { LandingPage } from "@/components/marketing/landing-page";
import { getLang } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

// Reciprocal hreflang: /ar already declares this page as its English
// alternate; without the return link search engines ignore the pair.
export const metadata: Metadata = {
  alternates: {
    canonical: SITE_URL,
    languages: {
      en: SITE_URL,
      ar: `${SITE_URL}/ar`,
      "x-default": SITE_URL,
    },
  },
};

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; prompt?: string; mode?: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <RootPage searchParams={searchParams} />
    </Suspense>
  );
}

async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; prompt?: string; mode?: string }>;
}) {
  const [session, lang] = await Promise.all([auth(), getLang()]);
  if (!session?.user) {
    return <LandingPage lang={lang} />;
  }
  // Signed-in users only. The chat client itself is split out through
  // next/dynamic in components/chat-lazy.tsx so anonymous visitors of the
  // landing page do not download it.
  const { NewChatPage } = await import("./new-chat-page");
  return <NewChatPage searchParams={searchParams} />;
}

