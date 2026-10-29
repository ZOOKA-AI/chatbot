import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "About | Zooka AI" };

export default function AboutPage() {
  return <LegalPage page="about" />;
}
