"use client";

import {
  MIN_PASSWORD_LENGTH,
  passwordProblem,
  passwordStrength,
} from "@/lib/auth/password-policy";

const LABELS = {
  ar: {
    empty: `${MIN_PASSWORD_LENGTH} أحرف على الأقل.`,
    too_short: `قصيرة: ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`,
    too_long: "طويلة جدًا.",
    too_common: "شائعة جدًا، اختر غيرها.",
    levels: ["", "مقبولة", "جيدة", "قوية", "قوية جدًا"],
  },
  en: {
    empty: `At least ${MIN_PASSWORD_LENGTH} characters.`,
    too_short: `Too short: at least ${MIN_PASSWORD_LENGTH} characters.`,
    too_long: "Too long.",
    too_common: "Too common, pick another.",
    levels: ["", "Fair", "Good", "Strong", "Very strong"],
  },
} as const;

const BAR = [
  "bg-red-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-green-500",
  "bg-emerald-500",
];

export function PasswordStrength({
  id,
  lang,
  value,
}: {
  id: string;
  lang: "ar" | "en";
  value: string;
}) {
  const t = LABELS[lang];
  const problem = value ? passwordProblem(value) : null;
  const score = value ? passwordStrength(value) : 0;
  const text = value ? (problem ? t[problem] : t.levels[score]) : t.empty;

  return (
    <div className="flex flex-col gap-1.5" id={id}>
      <div aria-hidden="true" className="flex gap-1">
        {[1, 2, 3, 4].map((step) => (
          <span
            className={`h-1 flex-1 rounded-full ${
              value && step <= Math.max(score, 1) ? BAR[score] : "bg-muted"
            }`}
            key={step}
          />
        ))}
      </div>
      <p
        aria-live="polite"
        className={`text-xs ${problem ? "text-destructive" : "text-muted-foreground"}`}
      >
        {text}
      </p>
    </div>
  );
}
