import type { Metadata } from "next";
import { getLang } from "@/lib/i18n";
import { RegisterClient } from "./register-client";

export const metadata: Metadata = {
  title: "إنشاء حساب",
};

export default async function Page() {
  const lang = await getLang();
  return <RegisterClient lang={lang} />;
}
