import type { Metadata } from "next";
import Link from "next/link";

// Digits joined with a zero-width non-joiner so devices cannot turn the
// printed number into a tap-to-call link. WhatsApp is the only support channel.
const ZW = "\u200C";
const WHATSAPP_NUMBER = "971566047579";
const DISPLAY_NUMBERS = ["0", "5", "6", "6", "0", "4", "7", "5", "7", "9"]
  .join(ZW);

export const metadata: Metadata = {
  title: "تواصل معنا | Contact ZOOKA AI",
  description:
    "الدعم الفني لـ ZOOKA AI عبر واتساب فقط. Contact ZOOKA AI support on WhatsApp only.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 p-6 py-16">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="font-semibold text-3xl">تواصل معنا</h1>
        <p className="text-muted-foreground">
          الدعم الفني متاح عبر واتساب فقط. لا نستقبل مكالمات على هذا الرقم.
        </p>
      </header>

      <section className="flex flex-col items-center gap-4 rounded-xl border p-6">
        <p className="text-muted-foreground text-sm">رقم الدعم على واتساب</p>
        <p
          className="select-all font-semibold text-2xl tabular-nums"
          style={{ unicodeBidi: "plaintext" }}
        >
          {DISPLAY_NUMBERS}
        </p>
        <a
          className="rounded-md bg-primary px-5 py-2 font-medium text-primary-foreground"
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          افتح محادثة واتساب
        </a>
        <p className="text-muted-foreground text-xs">
          Support is WhatsApp only. Please do not call this number.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold text-base">English</h2>
        <p className="text-muted-foreground">
          For account, billing, or subscription questions, message us on WhatsApp
          and we will reply during UAE business hours (Sunday to Thursday).
        </p>
      </section>

      <nav className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
        <Link href="/pricing">الأسعار</Link>
        <Link href="/privacy">سياسة الخصوصية</Link>
        <Link href="/terms">شروط الخدمة</Link>
        <Link href="/">الرئيسية</Link>
      </nav>
    </main>
  );
}
