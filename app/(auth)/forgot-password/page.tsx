import type { Metadata } from "next";
import { getLang } from "@/lib/i18n";
import { ForgotPasswordClient } from "./forgot-client";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  const lang = await getLang();
  return <ForgotPasswordClient lang={lang} />;
}
