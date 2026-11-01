import { Suspense } from "react";
import { LegalPage } from "@/components/legal-page";
import { brandTitle } from "@/lib/brand";
import { getLang } from "@/lib/i18n";
export async function generateMetadata() {
  const lang = await getLang();
  return {
    title: {
      absolute: brandTitle(lang === "ar" ? "تواصل معنا" : "Contact", lang),
    },
  };
}
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LegalPage page="contact" />
    </Suspense>
  );
}
