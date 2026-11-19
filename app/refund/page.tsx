import { Suspense } from "react";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Refund Policy" };

export default function RefundPage() {
  return (
    <Suspense fallback={null}>
      <LegalPage page="refund" />
    </Suspense>
  );
}
