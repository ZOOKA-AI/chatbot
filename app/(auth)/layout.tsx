import { dirOf, fontOf, getLang } from "@/lib/i18n";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lang = await getLang();

  return (
    <div dir={dirOf(lang)} lang={lang} style={{ fontFamily: fontOf(lang) }}>
      {children}
    </div>
  );
}
