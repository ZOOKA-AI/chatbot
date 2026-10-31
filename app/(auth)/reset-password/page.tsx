import type { Metadata } from "next";
import { getLang } from "@/lib/i18n";
import { ResetPasswordClient } from "./reset-client";

export const metadata: Metadata = { title: "New password · Zooka AI" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const lang = await getLang();
  const { token } = await searchParams;
  return <ResetPasswordClient lang={lang} token={token ?? ""} />;
}
