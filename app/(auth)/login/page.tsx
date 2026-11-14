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

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
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
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const lang = await getLang();
  const { error } = await searchParams;
  return (
    <LoginClient
      facebookEnabled={facebookLoginEnabled}
      googleEnabled={googleLoginEnabled}
      hasAuthError={Boolean(error)}
      lang={lang}
      microsoftEnabled={microsoftLoginEnabled}
      phoneEnabled={phoneLoginEnabled}
    />
  );
}
