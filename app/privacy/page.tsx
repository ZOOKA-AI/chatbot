import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy | Zooka AI" };

export default function PrivacyPage() {
  return <LegalPage page="privacy" />;
}
