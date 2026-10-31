import type { Metadata } from "next";
import { getLang } from "@/lib/i18n";
import { googleLoginEnabled } from "../auth";
import { LoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

export default async function Page() {
  const lang = await getLang();
  return <LoginClient googleEnabled={googleLoginEnabled} lang={lang} />;
}
