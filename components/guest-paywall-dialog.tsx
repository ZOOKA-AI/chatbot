"use client";

import Link from "next/link";
import { useBilling } from "@/components/billing-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copy } from "@/lib/copy";

export function GuestPaywallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { lang } = useBilling();
  const t = copy[lang];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        data-testid="guest-paywall"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        <DialogHeader>
          <DialogTitle>{t.paywallTitle}</DialogTitle>
          <DialogDescription>{t.paywallBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button asChild>
            <Link href="/register">{t.signUp}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">{t.logIn}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/pricing">{t.viewPlans}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
