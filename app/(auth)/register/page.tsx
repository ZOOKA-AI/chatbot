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

export const metadata: Metadata = {
  title: "إنشاء حساب",
};

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
