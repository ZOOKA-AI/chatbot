"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type ForgotPasswordState, requestPasswordReset } from "../actions";

export function ForgotPasswordClient({ lang }: { lang: "ar" | "en" }) {
  const ar = lang === "ar";
  const [state, action, pending] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordReset,
    { status: "idle" }
  );
  return (
    <div className="flex min-h-dvh items-center justify-center px-4" dir={ar ? "rtl" : "ltr"}>
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="mb-2 font-semibold text-2xl">
          {ar ? "استعادة كلمة المرور" : "Forgot your password?"}
        </h1>
        <p className="mb-6 text-muted-foreground text-sm">
          {ar
            ? "اكتب بريدك وسنرسل لك رابطًا صالحًا 30 دقيقة لتعيين كلمة مرور جديدة."
            : "Enter your email and we will send a 30-minute link to set a new password."}
        </p>
        {state.status === "sent" ? (
          <p className="rounded-lg border border-green-600/30 bg-green-600/10 p-4 text-sm">
            {ar
              ? "لو البريد مسجّل عندنا، وصلتك رسالة الآن. راجع صندوق الوارد أو الرسائل غير المرغوبة."
              : "If that email is registered, a message is on its way. Check your inbox or spam folder."}
          </p>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            <input
              className="rounded-md border bg-transparent px-3 py-2 text-sm"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
            {state.status === "invalid" ? (
              <p className="text-destructive text-xs">
                {ar ? "البريد غير صالح." : "Invalid email."}
              </p>
            ) : null}
            <button
              className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm disabled:opacity-60"
              disabled={pending}
              type="submit"
            >
              {ar ? "أرسل رابط الاستعادة" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-muted-foreground text-sm">
          <Link className="underline" href="/login">
            {ar ? "العودة لتسجيل الدخول" : "Back to sign in"}
          </Link>
        </p>
      </div>
    </div>
  );
}
