"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type ResetPasswordState, resetPassword } from "../actions";

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
  return (
    <div className="flex min-h-dvh items-center justify-center px-4" dir={ar ? "rtl" : "ltr"}>
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="mb-6 font-semibold text-2xl">
          {ar ? "كلمة مرور جديدة" : "Choose a new password"}
        </h1>
        {state.status === "success" ? (
          <div className="flex flex-col gap-4">
            <p className="rounded-lg border border-green-600/30 bg-green-600/10 p-4 text-sm">
              {ar ? "تم تغيير كلمة المرور بنجاح." : "Your password has been updated."}
            </p>
            <Link
              className="rounded-md bg-primary px-4 py-2 text-center font-medium text-primary-foreground text-sm"
              href="/login"
            >
              {ar ? "تسجيل الدخول" : "Sign in"}
            </Link>
          </div>
        ) : !token ? (
          <p className="text-destructive text-sm">
            {ar ? "الرابط غير صالح." : "This link is not valid."}
          </p>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            <input name="token" type="hidden" value={token} />
            <input
              className="rounded-md border bg-transparent px-3 py-2 text-sm"
              minLength={6}
              name="password"
              placeholder={ar ? "كلمة المرور الجديدة (6 أحرف على الأقل)" : "New password (min 6 characters)"}
              required
              type="password"
            />
            {state.status === "invalid_token" ? (
              <p className="text-destructive text-xs">
                {ar
                  ? "الرابط منتهي أو مستخدم من قبل. اطلب رابطًا جديدًا."
                  : "This link expired or was already used. Request a new one."}
              </p>
            ) : null}
            {state.status === "invalid_data" ? (
              <p className="text-destructive text-xs">
                {ar ? "بيانات غير صالحة." : "Invalid data."}
              </p>
            ) : null}
            <button
              className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm disabled:opacity-60"
              disabled={pending}
              type="submit"
            >
              {ar ? "حفظ كلمة المرور" : "Save password"}
            </button>
            <Link className="text-center text-muted-foreground text-xs underline" href="/forgot-password">
              {ar ? "طلب رابط جديد" : "Request a new link"}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
