"use client";

import Link from "next/link";
import { useBilling } from "@/components/billing-provider";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";

export function UpgradeButton({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const { lang, isSubscribed } = useBilling();

  if (isSubscribed) {
    return null;
  }

  return (
    <Button asChild className={className} size="sm">
      <Link
        data-testid="upgrade-button"
        href="/pricing"
        onClick={onNavigate}
      >
        {copy[lang].upgrade}
      </Link>
    </Button>
  );
}
