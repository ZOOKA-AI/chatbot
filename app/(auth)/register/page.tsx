import type { Metadata } from "next";
import { getLang } from "@/lib/i18n";
import { googleLoginEnabled } from "../auth";
import { RegisterClient } from "./register-client";

export const metadata: Metadata = {
  title: "إنشاء حساب",
};

export default async function Page() {
  const lang = await getLang();
  return <RegisterClient googleEnabled={googleLoginEnabled} lang={lang} />;
}
