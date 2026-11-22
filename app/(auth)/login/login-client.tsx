"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
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
    invalid: "Invalid credentials!",
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
    <div className="dark zk-brand zk-brand-bg relative grid min-h-dvh w-full overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
      <LanguageToggle lang={lang} />

      <aside className="relative hidden flex-col justify-between gap-10 overflow-hidden border-border border-e p-10 lg:flex">
        <Link className="flex items-center gap-3" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="ZOOKA-AI"
            className="size-11 rounded-xl"
            height={44}
            src="/brand/zooka-mark-256.png"
            width={44}
          />
          <span className="font-bold text-xl tracking-wide" dir="ltr">
            ZOOKA-AI
          </span>
        </Link>

        <div className="relative flex flex-1 items-center justify-center">
          <span aria-hidden="true" className="zk-orbit inset-x-0 top-[24%] h-[48%]" />
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
          <p className="font-bold text-3xl leading-snug">
            {isArabic ? "ذكاء اصطناعي يعمل معك، " : "AI that works with you, "}
            <span className="zk-gradient-text">
              {isArabic ? "وينجز عنك" : "and gets it done for you"}
            </span>
          </p>
          <p className="text-muted-foreground">
            {isArabic ? "تقنية بإيمان، تقدم بأخلاق" : "Innovate · Automate · Grow"}
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
              <li className="zk-card flex items-center gap-3 px-4 py-2.5" key={item}>
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
            <Link aria-label="ZOOKA-AI" className="flex items-center gap-2 lg:hidden" href="/">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                className="size-10 rounded-xl"
                height={40}
                src="/brand/zooka-mark-256.png"
                width={40}
              />
              <span className="font-bold text-lg tracking-wide" dir="ltr">
                ZOOKA-AI
              </span>
            </Link>
            <h1 className="font-bold text-2xl">{t.title}</h1>
            <p className="text-muted-foreground text-sm">{t.subtitle}</p>
          </div>
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
        </div>
      </main>
    </div>
  );
}
