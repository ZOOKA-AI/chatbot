import { Suspense } from "react";
import { dirOf, fontOf, getLang } from "@/lib/i18n";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div dir="rtl" />}>
      <AuthShell>{children}</AuthShell>
    </Suspense>
  );
}

async function AuthShell({ children }: { children: React.ReactNode }) {
  const lang = await getLang();

  return (
    <div dir={dirOf(lang)} lang={lang} style={{ fontFamily: fontOf(lang) }}>
      {children}
    </div>
  );
}
