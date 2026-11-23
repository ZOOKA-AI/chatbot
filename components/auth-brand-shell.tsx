import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";

/**
 * Shared ZOOKA-AI brand frame for every auth screen (sign-in, sign-up,
 * forgot / reset password). Visual only: each page keeps its own form,
 * actions and redirects.
 */
export function AuthBrandShell({
  lang,
  title,
  subtitle,
  children,
}: {
  lang: "ar" | "en";
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const isArabic = lang === "ar";

  return (
    <div
      className="dark zk-brand zk-brand-bg relative grid min-h-dvh w-full overflow-hidden lg:grid-cols-[1.05fr_0.95fr]"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <LanguageToggle lang={lang} />

      <aside className="border-border relative hidden flex-col justify-between gap-10 overflow-hidden border-e p-10 lg:flex">
        <Link className="flex items-center gap-3" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="ZOOKA-AI"
            className="size-11 rounded-xl"
            height={44}
            src="/brand/zooka-mark-256.png"
            width={44}
          />
          <span className="text-xl font-bold tracking-wide" dir="ltr">
            ZOOKA-AI
          </span>
        </Link>

        <div className="relative flex flex-1 items-center justify-center">
          <span
            aria-hidden="true"
            className="zk-orbit inset-x-0 top-[24%] h-[48%]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={
              isArabic
                ? "شخصية زوكا AI الروبوتية — رسم توضيحي للعلامة"
                : "The ZOOKA-AI robot character — a brand illustration"
            }
            className="zk-mascot relative w-full max-w-xl object-cover"
            decoding="async"
            height={675}
            src="/images/zooka-mascot.webp"
            width={1200}
          />
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-3xl leading-snug font-bold">
            {isArabic
              ? "ردود عملائك وفواتيرك ومتابعة طلباتك — "
              : "Customer replies, invoices and follow-ups — "}
            <span className="zk-gradient-text">
              {isArabic ? "من محادثة واحدة" : "from one chat"}
            </span>
          </p>
          <p className="text-muted-foreground">
            {isArabic
              ? "تقنية بإيمان، تقدم بأخلاق"
              : "Innovate · Automate · Grow"}
          </p>
          <ul className="grid gap-2 text-sm">
            {(isArabic
              ? [
                  "الربط بصفحة موافقة المزوّد الرسمية — لا نطلب كلمة مرور حساباتك",
                  "رموز مشفّرة ومعزولة لمساحة عملك فقط",
                  "أي إرسال لطرف خارجي ينتظر موافقتك",
                ]
              : [
                  "Connections use the provider's own consent screen — we never ask for your account passwords",
                  "Tokens encrypted and isolated to your workspace",
                  "Anything sent to an outside party waits for your approval",
                ]
            ).map((item) => (
              <li
                className="zk-card flex items-center gap-3 px-4 py-2.5"
                key={item}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-[#24D6E6] shadow-[0_0_10px_#24D6E6]"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="relative flex w-full items-start justify-center px-4 pt-20 pb-10 md:items-center md:py-10">
        <div className="zk-frame flex w-full max-w-md flex-col gap-6 px-2 py-8 sm:gap-8 sm:px-4">
          <div className="flex flex-col items-center justify-center gap-3 px-4 text-center sm:px-10">
            <Link
              aria-label="ZOOKA-AI"
              className="flex items-center gap-2 lg:hidden"
              href="/"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                className="size-10 rounded-xl"
                height={40}
                src="/brand/zooka-mark-256.png"
                width={40}
              />
              <span className="text-lg font-bold tracking-wide" dir="ltr">
                ZOOKA-AI
              </span>
            </Link>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {subtitle}
              </p>
            ) : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
