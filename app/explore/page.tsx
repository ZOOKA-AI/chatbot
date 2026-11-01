import type { Metadata } from "next";
import { Suspense } from "react";
import { PlatformSite } from "@/components/platform/platform-site";
import { getLang } from "@/lib/i18n";
export const metadata: Metadata = {
  title: "اكتشف Zooka | Explore",
  description:
    "مساحة واحدة للمشاريع والقوالب والكود والمهام، مع توضيح حدود التشغيل والربط.",
};
export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <ExploreContent />
    </Suspense>
  );
}
async function ExploreContent() {
  return <PlatformSite lang={await getLang()} />;
}
