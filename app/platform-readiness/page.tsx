import type { Metadata } from "next";
import { Suspense } from "react";
import { PlatformSite } from "@/components/platform/platform-site";
import { getLang } from "@/lib/i18n";
export const metadata: Metadata = {
  title: "جاهزية المنصة | Platform readiness",
  robots: { index: false, follow: false },
};
export default function ReadinessPage() {
  return (
    <Suspense fallback={null}>
      <ReadinessContent />
    </Suspense>
  );
}
async function ReadinessContent() {
  return <PlatformSite lang={await getLang()} readiness />;
}
