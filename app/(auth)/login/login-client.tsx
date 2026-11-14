"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { PhoneSignInForm } from "@/components/phone-sign-in-form";
import { SocialSignInButtons } from "@/components/social-sign-in-buttons";
import { LanguageToggle } from "@/components/language-toggle";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import { type LoginActionState, login } from "../actions";

const strings = {
  ar: {
    title: "تسجيل الدخول",
    subtitle: "أدخل بريدك الإلكتروني وكلمة المرور للمتابعة",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    submit: "دخول",
    noAccount: "ما عندك حساب؟",
    signUpLink: "أنشئ حساباً مجانياً",
    unavailable:
      "خدمة الحسابات غير متاحة مؤقتاً. حاول لاحقاً؛ لا تحتاج لتغيير كلمة المرور.",
    invalid: "بيانات الدخول غير صحيحة!",
    authError:
      "تعذّر تسجيل الدخول. يرجى المحاولة مرة أخرى أو استخدام طريقة أخرى.",
  },
  en: {
    title: "Sign In",
    subtitle: "Use your email and password to sign in",
    email: "Email Address",
    password: "Password",
    submit: "Sign in",
    noAccount: "Don't have an account?",
    signUpLink: "Sign up for free",
    unavailable:
      "Account service is temporarily unavailable. Please try later; you do not need to reset your password.",
    invalid: "Invalid credentials!",
    authError:
      "Unable to sign in. Please try again or use another sign-in method.",
  },
} as const;

export function LoginClient({
  lang,
  googleEnabled = false,
  facebookEnabled = false,
  microsoftEnabled = false,
  phoneEnabled = false,
  hasAuthError = false,
}: {
  lang: "ar" | "en";
  googleEnabled?: boolean;
  facebookEnabled?: boolean;
  microsoftEnabled?: boolean;
  phoneEnabled?: boolean;
  hasAuthError?: boolean;
}) {
  const t = strings[lang];
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    {
      status: "idle",
    }
  );

  const { update: updateSession } = useSession();

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
  useEffect(() => {
    if (state.status === "unavailable") {
      toast({ type: "error", description: t.unavailable });
    } else if (state.status === "failed") {
      toast({ type: "error", description: t.invalid });
    } else if (state.status === "invalid_data") {
      toast({ type: "error", description: t.invalid });
    } else if (state.status === "success") {
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
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            {t.subtitle}
          </p>
        </div>
        {hasAuthError ? (
          <p className="px-4 text-center text-red-600 text-sm" role="alert">
            {t.authError}
          </p>
        ) : null}
        {phoneEnabled ? <PhoneSignInForm lang={lang} /> : null}
        <SocialSignInButtons
          facebook={facebookEnabled}
          google={googleEnabled}
          lang={lang}
          microsoft={microsoftEnabled}
        />
        <AuthForm
          action={handleSubmit}
          defaultEmail={email}
          labels={{ email: t.email, password: t.password }}
        >
          <SubmitButton isSuccessful={isSuccessful}>{t.submit}</SubmitButton>
          <p className="mt-4 text-center text-gray-600 text-sm dark:text-zinc-400">
            {`${t.noAccount} `}
            <Link
              className="text-muted-foreground text-xs underline"
              href="/forgot-password"
            >
              {lang === "ar" ? "نسيت كلمة المرور؟" : "Forgot password?"}
            </Link>{" "}
            <Link
              className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
              href="/register"
            >
              {t.signUpLink}
            </Link>
          </p>
        </AuthForm>
      </div>
    </div>
  );
}
