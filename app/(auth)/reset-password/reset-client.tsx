"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LoaderIcon } from "@/components/icons";
import { type ResetPasswordState, resetPassword } from "../actions";

const primaryButton =
  "relative inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-4 font-medium text-base text-primary-foreground disabled:opacity-60 md:h-11 md:text-sm";

export function ResetPasswordClient({
  lang,
  token,
}: {
  lang: "ar" | "en";
  token: string;
}) {
  const ar = lang === "ar";
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(
    resetPassword,
    { status: "idle" }
  );
  const error =
    state.status === "invalid_token"
      ? ar
        ? "الرابط منتهي أو مستخدم من قبل. اطلب رابطًا جديدًا."
        : "This link expired or was already used. Request a new one."
      : state.status === "invalid_data"
        ? ar
          ? "كلمة المرور يجب أن تكون 6 أحرف على الأقل."
          : "Password must be at least 6 characters."
        : state.status === "unavailable"
          ? ar
            ? "الخدمة غير متاحة مؤقتًا. لم يُستخدم الرابط؛ حاول مرة أخرى بعد قليل."
            : "Service is temporarily unavailable. Your link was not used; please try again shortly."
          : null;

  return (
    <main
      className="flex min-h-dvh items-start justify-center px-4 pt-16 pb-10 sm:items-center sm:py-10"
      dir={ar ? "rtl" : "ltr"}
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
        <h1 className="mb-6 font-semibold text-2xl">
          {ar ? "كلمة مرور جديدة" : "Choose a new password"}
        </h1>
        {state.status === "success" ? (
          <div className="flex flex-col gap-4">
            <p
              className="rounded-lg border border-green-600/30 bg-green-600/10 p-4 text-base sm:text-sm"
              role="status"
            >
              {ar ? "تم تغيير كلمة المرور بنجاح." : "Your password has been updated."}
            </p>
            <Link className={primaryButton} href="/login">
              {ar ? "تسجيل الدخول" : "Sign in"}
            </Link>
          </div>
        ) : token ? (
          <form action={action} aria-busy={pending} className="flex flex-col gap-4">
            <input name="token" type="hidden" value={token} />
            <div className="flex flex-col gap-2">
              <label className="text-muted-foreground text-sm" htmlFor="new-password">
                {ar ? "كلمة المرور الجديدة" : "New password"}
              </label>
              <input
                aria-describedby={error ? "reset-error" : "reset-hint"}
                aria-invalid={Boolean(error)}
                autoComplete="new-password"
                className="h-12 w-full rounded-md border bg-transparent px-3 text-base md:h-11 md:text-sm"
                dir="ltr"
                id="new-password"
                minLength={6}
                name="password"
                required
                type="password"
              />
              <p className="text-muted-foreground text-xs" id="reset-hint">
                {ar ? "6 أحرف على الأقل." : "At least 6 characters."}
              </p>
            </div>
            {error ? (
              <p className="text-destructive text-sm" id="reset-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className={primaryButton} disabled={pending} type="submit">
              {ar ? "حفظ كلمة المرور" : "Save password"}
              {pending ? (
                <span aria-hidden="true" className="absolute end-4 animate-spin">
                  <LoaderIcon />
                </span>
              ) : null}
            </button>
            <Link
              className="inline-flex min-h-11 items-center justify-center self-center px-2 text-muted-foreground text-sm underline underline-offset-4"
              href="/forgot-password"
            >
              {ar ? "طلب رابط جديد" : "Request a new link"}
            </Link>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-base text-destructive sm:text-sm" role="alert">
              {ar ? "الرابط غير صالح." : "This link is not valid."}
            </p>
            <Link className={primaryButton} href="/forgot-password">
              {ar ? "طلب رابط جديد" : "Request a new link"}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
