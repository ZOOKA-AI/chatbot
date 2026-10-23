"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { LanguageToggle } from "@/components/language-toggle";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import { type RegisterActionState, register } from "../actions";

const strings = {
  ar: {
    title: "إنشاء حساب",
    subtitle: "أنشئ حسابك ببريدك الإلكتروني وكلمة المرور",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    submit: "إنشاء الحساب",
    hasAccount: "عندك حساب بالفعل؟",
    signInLink: "سجّل الدخول",
    agreePrefix: "بإنشاء الحساب أنت توافق على ",
    terms: "شروط الخدمة",
    and: " و",
    privacy: "سياسة الخصوصية",
    exists: "الحساب موجود بالفعل!",
    failed: "فشل إنشاء الحساب!",
    invalid: "تحقق من البريد الإلكتروني وكلمة المرور (6 أحرف على الأقل)!",
    success: "تم إنشاء الحساب بنجاح!",
  },
  en: {
    title: "Sign Up",
    subtitle: "Create an account with your email and password",
    email: "Email Address",
    password: "Password",
    submit: "Sign Up",
    hasAccount: "Already have an account?",
    signInLink: "Sign in",
    agreePrefix: "By signing up, you agree to our ",
    terms: "Terms of Service",
    and: " and ",
    privacy: "Privacy Policy",
    exists: "Account already exists!",
    failed: "Failed to create account!",
    invalid: "Failed validating your submission!",
    success: "Account created successfully!",
  },
} as const;

export function RegisterClient({ lang }: { lang: "ar" | "en" }) {
  const t = strings[lang];
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<RegisterActionState, FormData>(
    register,
    { status: "idle" }
  );

  const { update: updateSession } = useSession();

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
  useEffect(() => {
    if (state.status === "user_exists") {
      toast({ type: "error", description: t.exists });
    } else if (state.status === "failed") {
      toast({ type: "error", description: t.failed });
    } else if (state.status === "invalid_data") {
      toast({ type: "error", description: t.invalid });
    } else if (state.status === "success") {
      toast({ type: "success", description: t.success });
      setIsSuccessful(true);
      updateSession();
      router.refresh();
    }
  }, [state.status]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <LanguageToggle lang={lang} />
      <div className="flex w-full max-w-md flex-col gap-12 overflow-hidden rounded-2xl">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="font-semibold text-xl dark:text-zinc-50">{t.title}</h3>
          <p className="text-gray-500 text-sm dark:text-zinc-400">{t.subtitle}</p>
        </div>
        <AuthForm
          action={handleSubmit}
          defaultEmail={email}
          labels={{ email: t.email, password: t.password }}
        >
          <SubmitButton isSuccessful={isSuccessful}>{t.submit}</SubmitButton>
          <p className="mt-4 text-center text-gray-600 text-sm dark:text-zinc-400">
            {`${t.hasAccount} `}
            <Link
              className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
              href="/login"
            >
              {t.signInLink}
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-gray-500 dark:text-zinc-500">
            {t.agreePrefix}
            <Link
              className="font-medium text-gray-700 underline dark:text-zinc-300"
              href="/terms"
            >
              {t.terms}
            </Link>
            {t.and}
            <Link
              className="font-medium text-gray-700 underline dark:text-zinc-300"
              href="/privacy"
            >
              {t.privacy}
            </Link>
            {"."}
          </p>
        </AuthForm>
      </div>
    </div>
  );
}
