import { brandTitle, TAGLINE_AR, TAGLINE_EN } from "@/lib/brand";
import type { Metadata } from "next";
import { getLang } from "@/lib/i18n";
import { googleLoginEnabled } from "../auth";
import { RegisterClient } from "./register-client";

export async function generateMetadata() {
  const lang = await getLang();
  return {
    title: {
      absolute: brandTitle(
        lang === "ar" ? "إنشاء حساب" : "Create account",
        lang,
      ),
    },
    description: lang === "ar" ? TAGLINE_AR : TAGLINE_EN,
  };
}

export default async function Page() {
  const lang = await getLang();
  return <RegisterClient googleEnabled={googleLoginEnabled} lang={lang} />;
}
