"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";

import {
  type LoginActionState,
  login,
  type RegisterActionState,
  register,
} from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";

const strings = {
  ar: {
    title: "زوكا إيه آي",
    subtitle: "سجّل للبدء بالمحادثة مع المساعد الذكي",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "دخول",
    signUp: "إنشاء حساب",
    switchToSignIn: "عندك حساب؟ سجّل الدخول",
    switchToSignUp: "ما عندك حساب؟ أنشئ حساباً مجانياً",
    invalid: "بيانات الدخول غير صحيحة!",
    exists: "الحساب موجود بالفعل!",
    failed: "حدث خطأ، حاول مرة أخرى!",
    success: "تم إنشاء الحساب بنجاح!",
  },
} as const;

export function EmbedAuth() {
  const t = strings.ar;
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");

  const [loginState, loginAction] = useActionState<LoginActionState, FormData>(
    login,
    { status: "idle" }
  );
  const [registerState, registerAction] = useActionState<
    RegisterActionState,
    FormData
  >(register, { status: "idle" });

  const { update: updateSession } = useSession();

  const state = mode === "login" ? loginState : registerState;

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
  useEffect(() => {
    if (state.status === "failed") {
      toast({ type: "error", description: t.failed });
    } else if (state.status === "invalid_data") {
      toast({ type: "error", description: t.invalid });
    } else if (state.status === "user_exists") {
      toast({ type: "error", description: t.exists });
    } else if (state.status === "success") {
      if (mode === "register") {
        toast({ type: "success", description: t.success });
      }
      updateSession();
      router.replace("/embed");
      router.refresh();
    }
  }, [state.status]);

  return (
    <div
      className="flex h-dvh w-full items-center justify-center bg-background p-4"
      dir="rtl"
      lang="ar"
      style={{ fontFamily: "var(--font-cairo), system-ui" }}
    >
      <div className="flex w-full max-w-sm flex-col gap-8 overflow-hidden rounded-2xl border p-6">
        <div className="flex flex-col items-center justify-center gap-1 text-center">
          <h3 className="font-semibold text-xl dark:text-zinc-50">{t.title}</h3>
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            {t.subtitle}
          </p>
        </div>
        <AuthForm
          action={mode === "login" ? loginAction : registerAction}
          emailPlaceholder="name@example.com"
          labels={{ email: t.email, password: t.password }}
        >
          <SubmitButton isSuccessful={false}>
            {mode === "login" ? t.signIn : t.signUp}
          </SubmitButton>
          <button
            className="mt-2 w-full text-center text-muted-foreground text-sm hover:underline"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            type="button"
          >
            {mode === "login" ? t.switchToSignUp : t.switchToSignIn}
          </button>
        </AuthForm>
      </div>
    </div>
  );
}
