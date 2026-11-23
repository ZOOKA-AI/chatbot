import { Suspense } from "react";
import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: `شروط الاستخدام`,
  description: `شروط استخدام منصة Zooka AI: الاشتراكات والاستخدام العادل والجهة المشغّلة.`,
  alternates: { canonical: "./" },
};

export default function TermsPage() {
  return (
    <Suspense fallback={null}>
      <LegalPage page="terms" />
    </Suspense>
  );
}
