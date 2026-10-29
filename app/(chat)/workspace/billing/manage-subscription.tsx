"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

export function ManageSubscriptionButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    trackEvent("manage_subscription_clicked", { source: "billing" });
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data?.url) {
        throw new Error(data?.error ?? "Unable to open subscription management");
      }
      window.location.href = data.url;
    } catch (portalError) {
      setError(
        portalError instanceof Error
          ? portalError.message
          : "Unable to open subscription management"
      );
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
        disabled={pending}
        onClick={openPortal}
        type="button"
      >
        {pending ? "Opening…" : "Manage subscription"}
      </button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
