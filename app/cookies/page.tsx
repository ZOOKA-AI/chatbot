import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Cookies | Zooka AI" };

export default function CookiesPage() {
  return <LegalPage page="cookies" />;
}
