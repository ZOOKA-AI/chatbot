import { Suspense } from "react";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Cookies" };

export default function CookiesPage() {
  return (
    <Suspense fallback={null}>
      <LegalPage page="cookies" />
    </Suspense>
  );
}
