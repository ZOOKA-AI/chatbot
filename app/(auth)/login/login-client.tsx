"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { PhoneSignInForm } from "@/components/phone-sign-in-form";
import { SocialSignInButtons } from "@/components/social-sign-in-buttons";
import { AuthBrandShell } from "@/components/auth-brand-shell";
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
    invalid:
      "بيانات الدخول غير صحيحة. لو أنشأت حسابك بـ Google أو Facebook، ادخل بنفس الطريقة أو عيّن كلمة مرور من «نسيت كلمة المرور؟».",
    authError:
      "تعذّر تسجيل الدخول. يرجى المحاولة مرة أخرى أو استخدام طريقة أخرى.",
    justRegistered:
      "تم استلام طلبك. إن كان هذا بريدك الجديد فالحساب جاهز: سجّل الدخول الآن. وإن كان لديك حساب فاستخدم كلمة مرورك أو استعدها.",
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
    invalid:
      "Invalid credentials. If you signed up with Google or Facebook, sign in the same way or set a password with \"Forgot password?\".",
    authError:
      "Unable to sign in. Please try again or use another sign-in method.",
    justRegistered:
      "Your request was received. If this address is new, the account is ready: sign in now. If you already have an account, use your password or reset it.",
  },
} as const;

export function LoginClient({
  lang,
  googleEnabled = false,
  facebookEnabled = false,
  microsoftEnabled = false,
  phoneEnabled = false,
  hasAuthError = false,
  justRegistered = false,
}: {
  lang: "ar" | "en";
  googleEnabled?: boolean;
  facebookEnabled?: boolean;
  microsoftEnabled?: boolean;
  phoneEnabled?: boolean;
  hasAuthError?: boolean;
  justRegistered?: boolean;
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
    // Sign in through the Auth.js browser client, which posts to
    // /api/auth/callback/credentials. The server action returns "success" but
    // its response carries no Set-Cookie, so the session never reached the
    // browser and every protected page bounced back to /login. Proven by
    // calling the callback route directly: it sets __Secure-authjs.session-token.
    void signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirect: false,
    }).then((result) => {
      if (result?.error) {
        toast({ type: "error", description: t.invalid });
        return;
      }
      setIsSuccessful(true);
      updateSession();
      router.refresh();
      // A full assign is intentional: the middleware has to see the new cookie on
      // the very next navigation.
      window.location.assign("/workspace/home");
    });
  };

  const isArabic = lang === "ar";

  return (
    <AuthBrandShell lang={lang} subtitle={t.subtitle} title={t.title}>
          {hasAuthError ? (
            <p className="px-4 text-center text-red-400 text-sm" role="alert">
              {t.authError}
            </p>
          ) : null}
          {justRegistered && !hasAuthError ? (
            <p
              className="px-4 text-center text-emerald-400 text-sm"
              data-testid="register-notice"
              role="status"
            >
              {t.justRegistered}
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
            <Link
              className="inline-flex min-h-11 items-center justify-center self-center px-2 text-muted-foreground text-sm underline underline-offset-4"
              href="/forgot-password"
            >
              {isArabic ? "نسيت كلمة المرور؟" : "Forgot password?"}
            </Link>
            <p className="text-center text-muted-foreground text-sm">
              {`${t.noAccount} `}
              <Link
                className="font-semibold text-[#8fb2ff] hover:underline"
                href="/register"
              >
                {t.signUpLink}
              </Link>
            </p>
          </AuthForm>
    </AuthBrandShell>
  );
}
