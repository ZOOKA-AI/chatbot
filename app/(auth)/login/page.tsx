import type { Metadata } from "next";
import { getLang } from "@/lib/i18n";
import { LoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "تسجيل الدخول | Zooka AI",
};

export default async function Page() {
  const lang = await getLang();
  return <LoginClient lang={lang} />;
}
