import { Suspense } from "react";
import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: `سياسة الخصوصية`,
  description: `سياسة الخصوصية في Zooka AI: كيف نجمع بياناتك ونحميها ومن الجهة المشغّلة.`,
  alternates: { canonical: "./" },
};

export default function PrivacyPage() {
  return (
    <Suspense fallback={null}>
      <LegalPage page="privacy" />
    </Suspense>
  );
}
