import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { BrowserConsole } from "@/components/browser-console";

export const metadata = { title: "متصفح الوكيل — ZOOKA-AI" };

function safeUrl(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export default async function BrowserPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string | string[] }>;
}) {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  const { url } = await searchParams;
  // The panel can hand over a page it could not frame; the address is re-checked server-side by the
  // session route, and here it only prefills the field, so an invalid value is dropped, not followed.
  return <BrowserConsole initialUrl={safeUrl(url)} />;
}
