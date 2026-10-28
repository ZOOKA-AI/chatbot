import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Contact | Zooka AI" };

export default function ContactPage() {
  return <LegalPage page="contact" />;
}
