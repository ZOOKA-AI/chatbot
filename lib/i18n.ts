import { cookies } from "next/headers";

export type Lang = "ar" | "en";

export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return store.get("zooka_lang")?.value === "en" ? "en" : "ar";
}

export function dirOf(lang: Lang): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}

export function fontOf(lang: Lang): string | undefined {
  return lang === "ar" ? "var(--font-cairo), system-ui" : undefined;
}
