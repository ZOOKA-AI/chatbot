"use client";

import { AuthBrandShell } from "@/components/auth-brand-shell";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { SocialSignInButtons } from "@/components/social-sign-in-buttons";
import { PhoneSignInForm } from "@/components/phone-sign-in-form";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import {
  registerFeedback,
  SUBMIT_LOCK_MS,
} from "@/lib/auth/register-feedback";
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
    checkEmail: "تم استلام طلبك. إن كان البريد جديدًا فالحساب جاهز الآن — سجّل الدخول. وإن كان لديك حساب فاستخدم كلمة مرورك أو استعدها.",
    unavailable: "خدمة الحسابات غير متاحة مؤقتاً. حاول لاحقاً.",
    failed: "فشل إنشاء الحساب!",
    invalid: "تحقق من البريد الإلكتروني وكلمة المرور (6 أحرف على الأقل)!",
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
    checkEmail:
      "Your request was received. If this address is new, the account is ready — sign in. If you already have an account, use your password or reset it.",
    unavailable:
      "Account service is temporarily unavailable. Please try later.",
    failed: "Failed to create account!",
    invalid: "Failed validating your submission!",
  },
} as const;

export function RegisterClient({
  lang,
  googleEnabled = false,
  facebookEnabled = false,
  microsoftEnabled = false,
  phoneEnabled = false,
}: {
  lang: "ar" | "en";
  googleEnabled?: boolean;
  facebookEnabled?: boolean;
  microsoftEnabled?: boolean;
  phoneEnabled?: boolean;
}) {
  const t = strings[lang];
  const router = useRouter();

  const [email, setEmail] = useState("");
  // Shut while the outcome is being announced or the sign-in form loads. It is
  // always released again: a disabled button must never outlive the message.
  const [submitLocked, setSubmitLocked] = useState(false);

  const [state, formAction] = useActionState<RegisterActionState, FormData>(
    register,
    { status: "idle" }
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: router is a stable ref
  useEffect(() => {
    const feedback = registerFeedback(state.status);

    if (feedback.kind === "none") {
      setSubmitLocked(false);
      return;
    }

    const text = {
      checkEmail: t.checkEmail,
      unavailable: t.unavailable,
      invalid: t.invalid,
      failed: t.failed,
    }[feedback.kind === "navigate" ? feedback.toast.text : feedback.text];

    toast({ type: feedback.kind === "navigate" ? feedback.toast.tone : feedback.tone, description: text });

    // Release the button on its own timer first, so no code path below can
    // leave a spinner running if the move to the sign-in form does not happen.
    setSubmitLocked(feedback.lockSubmit);
    const release = feedback.lockSubmit
      ? setTimeout(() => setSubmitLocked(false), SUBMIT_LOCK_MS)
      : null;

    if (feedback.kind === "navigate") {
      // replace, not push: pressing Back from the sign-in form must not land on
      // a form that has already been submitted. No router.refresh() here, it
      // re-renders the current route and cancels the move.
      router.replace(feedback.to);
    }

    return () => {
      if (release) clearTimeout(release);
    };
  }, [state.status]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  return (
    <AuthBrandShell lang={lang} subtitle={t.subtitle} title={t.title}>
        {phoneEnabled ? <PhoneSignInForm lang={lang} /> : null}
        <SocialSignInButtons
          lang={lang}
          google={googleEnabled}
          facebook={facebookEnabled}
          microsoft={microsoftEnabled}
        />
        <AuthForm
          action={handleSubmit}
          defaultEmail={email}
          labels={{ email: t.email, password: t.password }}
          passwordAutoComplete="new-password"
        >
          <SubmitButton isSuccessful={submitLocked}>{t.submit}</SubmitButton>
          <p className="mt-4 text-center text-muted-foreground text-sm">
            {`${t.hasAccount} `}
            <Link
              className="font-semibold text-[#8fb2ff] hover:underline"
              href="/login"
            >
              {t.signInLink}
            </Link>
          </p>
          <p className="mt-2 text-center text-muted-foreground text-xs">
            {t.agreePrefix}
            <Link
              className="font-medium text-foreground underline"
              href="/terms"
            >
              {t.terms}
            </Link>
            {t.and}
            <Link
              className="font-medium text-foreground underline"
              href="/privacy"
            >
              {t.privacy}
            </Link>
            {"."}
          </p>
        </AuthForm>
    </AuthBrandShell>
  );
}
