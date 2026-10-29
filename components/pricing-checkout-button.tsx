"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
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

  async function beginCheckout() {
    trackEvent("click_upgrade", { plan });
    setIsLoading(true);
    setError("");
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
        window.location.assign("/login");
        return;
      }
      if (!response.ok || !result.url) {
        setError(result.error ?? "Unable to start checkout");
        return;
      }
      trackEvent("checkout_started", { plan });
      window.location.assign(result.url);
    } catch {
      setError("Unable to connect to billing");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
        disabled={isLoading || Boolean(setupMessage)}
        onClick={beginCheckout}
        type="button"
      >
        {isLoading ? "Redirecting…" : label}
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
