"use client";

import { track } from "@vercel/analytics";
import { useState } from "react";

export function ManageSubscriptionButton({
  lang = "ar",
}: {
  lang?: "ar" | "en";
}) {
  const ar = lang === "ar";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setPending(true);
    setError(null);
    track("manage_subscription_clicked");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data?.url) {
        throw new Error(
          ar ? "تعذّر فتح إدارة الاشتراك." : "Unable to open subscription management"
        );
      }
      window.location.href = data.url;
    } catch (portalError) {
      setError(
        portalError instanceof Error
          ? portalError.message
          : ar
            ? "تعذّر فتح إدارة الاشتراك."
            : "Unable to open subscription management"
      );
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className="w-fit rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
        disabled={pending}
        onClick={openPortal}
        type="button"
      >
        {pending
          ? ar
            ? "جارٍ الفتح…"
            : "Opening…"
          : ar
            ? "إدارة الاشتراك"
            : "Manage subscription"}
      </button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
