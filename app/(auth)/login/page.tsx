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
  searchParams: Promise<{
    error?: string | string[];
    registered?: string | string[];
    callbackUrl?: string | string[];
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
    callbackUrl?: string | string[];
  }>;
}) {
  const lang = await getLang();
  const { error, registered, callbackUrl } = await searchParams;
  const returnTo =
    typeof callbackUrl === "string" &&
    callbackUrl.startsWith("/") &&
    !callbackUrl.startsWith("//") &&
    !callbackUrl.startsWith("/\\")
      ? callbackUrl
      : "/workspace/home";
  return (
    <LoginClient
      facebookEnabled={facebookLoginEnabled}
      googleEnabled={googleLoginEnabled}
      hasAuthError={Boolean(error)}
      justRegistered={Boolean(registered)}
      callbackUrl={returnTo}
      lang={lang}
      microsoftEnabled={microsoftLoginEnabled}
      phoneEnabled={phoneLoginEnabled}
    />
  );
}
