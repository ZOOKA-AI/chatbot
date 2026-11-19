"use client";

import { track } from "@vercel/analytics";
import { useState } from "react";
import { useBilling } from "@/components/billing-provider";
import type { PaidWorkspacePlan } from "@/lib/saas/plans";

export function PricingCheckoutButton({
  plan,
  label,
  setupMessage,
}: {
  plan: PaidWorkspacePlan;
  label: string;
  setupMessage?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { lang } = useBilling();

  async function beginCheckout() {
    setIsLoading(true);
    setError("");
    track("click_upgrade", { plan });
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };

      if (response.status === 403) {
        // New visitors must create a workspace before paying, not hit a login wall.
        window.location.assign("/register?next=%2Fpricing");
        return;
      }
      if (!response.ok || !result.url) {
        setError(
          lang === "ar"
            ? "تعذّر بدء الدفع. تحقّق من إعدادات الفوترة أو حاول مجدداً."
            : (result.error ?? "Unable to start checkout. Please try again.")
        );
        return;
      }
      track("checkout_started", { plan });
      window.location.assign(result.url);
    } catch {
      setError(
        lang === "ar"
          ? "تعذّر الاتصال بخدمة الدفع. حاول مجدداً."
          : "Unable to connect to billing. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        aria-busy={isLoading}
        className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
        disabled={isLoading || Boolean(setupMessage)}
        onClick={beginCheckout}
        type="button"
      >
        {isLoading
          ? lang === "ar"
            ? "جارٍ التحويل للدفع…"
            : "Redirecting…"
          : label}
      </button>
      {setupMessage && (
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {setupMessage}
        </p>
      )}
      {error && (
        <p aria-live="polite" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
