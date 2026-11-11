"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

type Lang = "ar" | "en";

const copy = {
  ar: {
    phoneLabel: "رقم الهاتف",
    phoneHint: "مثال: 0501234567 أو ‎+971501234567",
    send: "أرسل رمز التحقق",
    sending: "جارٍ الإرسال…",
    codeLabel: "رمز التحقق المكوَّن من 6 أرقام",
    verify: "تحقق ودخول",
    verifying: "جارٍ التحقق…",
    change: "تغيير الرقم",
    invalidPhone: "أدخل رقم هاتف صحيحاً.",
    rateLimited: "طلبات كثيرة، انتظر ربع ساعة ثم أعد المحاولة.",
    smsFailed: "تعذّر إرسال الرسالة، حاول بعد قليل.",
    invalidCode: "الرمز غير صحيح.",
    expired: "انتهت صلاحية الرمز، اطلب رمزاً جديداً.",
    tooMany: "محاولات كثيرة على هذا الرمز، اطلب رمزاً جديداً.",
    generic: "حدث خطأ، حاول مرة أخرى.",
    sentTo: "أرسلنا رمزاً إلى",
  },
  en: {
    phoneLabel: "Phone number",
    phoneHint: "e.g. 0501234567 or +971501234567",
    send: "Send code",
    sending: "Sending…",
    codeLabel: "6-digit verification code",
    verify: "Verify and sign in",
    verifying: "Verifying…",
    change: "Change number",
    invalidPhone: "Enter a valid phone number.",
    rateLimited: "Too many requests. Try again in 15 minutes.",
    smsFailed: "The message could not be sent. Try again shortly.",
    invalidCode: "That code is not correct.",
    expired: "The code expired. Request a new one.",
    tooMany: "Too many attempts on this code. Request a new one.",
    generic: "Something went wrong. Try again.",
    sentTo: "We sent a code to",
  },
} as const;

function messageFor(error: string, t: (typeof copy)["ar"] | (typeof copy)["en"]) {
  switch (error) {
    case "invalid_phone":
      return t.invalidPhone;
    case "rate_limited":
      return t.rateLimited;
    case "sms_failed":
      return t.smsFailed;
    case "invalid":
      return t.invalidCode;
    case "expired":
      return t.expired;
    case "too_many_attempts":
      return t.tooMany;
    default:
      return t.generic;
  }
}

export function PhoneSignInForm({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/phone-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", phone }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(messageFor(data.error ?? "", t));
        return;
      }
      setStep("code");
    } catch {
      setError(t.generic);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/phone-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", phone, code }),
      });
      const data = (await response.json()) as {
        error?: string;
        ticket?: string;
      };
      if (!response.ok || !data.ticket) {
        setError(messageFor(data.error ?? "", t));
        return;
      }
      await signIn("phone-otp", { ticket: data.ticket, callbackUrl: "/" });
    } catch {
      setError(t.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 sm:px-16">
      {step === "phone" ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) {
              void requestCode();
            }
          }}
        >
          <label className="text-sm" htmlFor="phone">
            {t.phoneLabel}
          </label>
          <Input
            autoComplete="tel"
            dir="ltr"
            id="phone"
            inputMode="tel"
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t.phoneHint}
            value={phone}
          />
          <button
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary font-medium text-primary-foreground text-sm disabled:opacity-50"
            disabled={busy}
            type="submit"
          >
            {busy ? t.sending : t.send}
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) {
              void verifyCode();
            }
          }}
        >
          <p className="text-muted-foreground text-xs" dir="auto">
            {t.sentTo} <span dir="ltr">{phone}</span>
          </p>
          <label className="text-sm" htmlFor="code">
            {t.codeLabel}
          </label>
          <Input
            autoComplete="one-time-code"
            dir="ltr"
            id="code"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            value={code}
          />
          <button
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary font-medium text-primary-foreground text-sm disabled:opacity-50"
            disabled={busy || code.length !== 6}
            type="submit"
          >
            {busy ? t.verifying : t.verify}
          </button>
          <button
            className="text-muted-foreground text-xs underline"
            onClick={() => {
              setStep("phone");
              setCode("");
              setError(null);
            }}
            type="button"
          >
            {t.change}
          </button>
        </form>
      )}

      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
