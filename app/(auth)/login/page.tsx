import { brandTitle, TAGLINE_AR, TAGLINE_EN } from "@/lib/brand";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getLang } from "@/lib/i18n";
import { phoneLoginEnabled } from "@/lib/auth/sms";
import {
  facebookLoginEnabled,
  googleLoginEnabled,
  microsoftLoginEnabled,
} from "../auth";
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

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    registered?: string | string[];
  }>;
}) {
  return (
    <Suspense fallback={null}>
      <LoginPage searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    registered?: string | string[];
  }>;
}) {
  const lang = await getLang();
  const { error, registered } = await searchParams;
  return (
    <LoginClient
      facebookEnabled={facebookLoginEnabled}
      googleEnabled={googleLoginEnabled}
      hasAuthError={Boolean(error)}
      justRegistered={Boolean(registered)}
      lang={lang}
      microsoftEnabled={microsoftLoginEnabled}
      phoneEnabled={phoneLoginEnabled}
    />
  );
}
