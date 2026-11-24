"use client";

import { AuthBrandShell } from "@/components/auth-brand-shell";
import Link from "next/link";
import { useActionState } from "react";
import { LoaderIcon } from "@/components/icons";
import { type ForgotPasswordState, requestPasswordReset } from "../actions";

export function ForgotPasswordClient({ lang }: { lang: "ar" | "en" }) {
  const ar = lang === "ar";
  const [state, action, pending] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordReset,
    { status: "idle" }
  );
  return (
    <AuthBrandShell
      lang={lang}
      title={ar ? "استعادة كلمة المرور" : "Forgot your password?"}
      subtitle={
        ar
          ? "اكتب بريدك وسنرسل لك رابطًا صالحًا 30 دقيقة لتعيين كلمة مرور جديدة."
          : "Enter your email and we will send a 30-minute link to set a new password."
      }
    >
      <div className="px-3 sm:px-6">
        {state.status === "sent" ? (
          <p
            className="rounded-lg border border-green-600/30 bg-green-600/10 p-4 text-base leading-relaxed sm:text-sm"
            role="status"
          >
            {ar
              ? "لو البريد مسجّل عندنا، وصلتك رسالة الآن. راجع صندوق الوارد أو الرسائل غير المرغوبة."
              : "If that email is registered, a message is on its way. Check your inbox or spam folder."}
          </p>
        ) : (
          <form action={action} aria-busy={pending} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-muted-foreground text-sm" htmlFor="forgot-email">
                {ar ? "البريد الإلكتروني" : "Email address"}
              </label>
              <input
                aria-describedby={state.status === "invalid" ? "forgot-email-error" : undefined}
                aria-invalid={state.status === "invalid"}
                autoComplete="email"
                className="h-12 w-full rounded-md border bg-transparent px-3 text-base md:h-11 md:text-sm"
                dir="ltr"
                id="forgot-email"
                inputMode="email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
            </div>
            {state.status === "invalid" ? (
              <p className="text-destructive text-sm" id="forgot-email-error" role="alert">
                {ar ? "البريد غير صالح." : "Invalid email."}
              </p>
            ) : null}
            <button
              className="relative inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-4 font-medium text-base text-primary-foreground disabled:opacity-60 md:h-11 md:text-sm"
              disabled={pending}
              type="submit"
            >
              {ar ? "أرسل رابط الاستعادة" : "Send reset link"}
              {pending ? (
                <span aria-hidden="true" className="absolute end-4 animate-spin">
                  <LoaderIcon />
                </span>
              ) : null}
            </button>
          </form>
        )}
        <p className="mt-6 text-center">
          <Link
            className="inline-flex min-h-11 items-center px-2 text-muted-foreground text-sm underline underline-offset-4"
            href="/login"
          >
            {ar ? "العودة لتسجيل الدخول" : "Back to sign in"}
          </Link>
        </p>
      </div>
    </AuthBrandShell>
  );
}
