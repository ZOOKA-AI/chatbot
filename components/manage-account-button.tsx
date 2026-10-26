"use client";

import { useState } from "react";
import { useBilling } from "@/components/billing-provider";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";

export function ManageAccountButton({ className }: { className?: string }) {
  const { lang, canManageBilling } = useBilling();
  const [pending, setPending] = useState(false);

  if (!canManageBilling) {
    return null;
  }

  async function openPortal() {
    setPending(true);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Unable to open subscription management");
      }
      window.location.assign(data.url);
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Unable to open subscription management",
      });
      setPending(false);
    }
  }

  return (
    <Button
      className={className}
      data-testid="manage-account-button"
      disabled={pending}
      onClick={openPortal}
      size="sm"
      type="button"
      variant="outline"
    >
      {pending ? copy[lang].opening : copy[lang].manageAccount}
    </Button>
  );
}
