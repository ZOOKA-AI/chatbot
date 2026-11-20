import { brandTitle, TAGLINE_AR, TAGLINE_EN } from "@/lib/brand";
import type { Metadata } from "next";
import { Suspense } from "react";
import { phoneLoginEnabled } from "@/lib/auth/sms";
import { getLang } from "@/lib/i18n";
import {
  facebookLoginEnabled,
  googleLoginEnabled,
  microsoftLoginEnabled,
} from "../auth";
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

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RegisterPage />
    </Suspense>
  );
}

async function RegisterPage() {
  const lang = await getLang();
  return (
    <RegisterClient
      facebookEnabled={facebookLoginEnabled}
      googleEnabled={googleLoginEnabled}
      lang={lang}
      microsoftEnabled={microsoftLoginEnabled}
      phoneEnabled={phoneLoginEnabled}
    />
  );
}
