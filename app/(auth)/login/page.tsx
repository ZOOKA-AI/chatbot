import { brandTitle, TAGLINE_AR, TAGLINE_EN } from "@/lib/brand";
import type { Metadata } from "next";
import { getLang } from "@/lib/i18n";
import { googleLoginEnabled } from "../auth";
import { LoginClient } from "./login-client";

export async function generateMetadata() {
  const lang = await getLang();
  return {
    title: {
      absolute: brandTitle(lang === "ar" ? "تسجيل الدخول" : "Sign in", lang),
    },
    description: lang === "ar" ? TAGLINE_AR : TAGLINE_EN,
  };
}

export default async function Page() {
  const lang = await getLang();
  return <LoginClient googleEnabled={googleLoginEnabled} lang={lang} />;
}
