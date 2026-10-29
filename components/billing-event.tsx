"use client";

import { track } from "@vercel/analytics";
import { useEffect } from "react";

export type BillingEventName =
  | "checkout_success"
  | "manage_subscription_clicked"
  | "paywall_shown";

export function BillingEvent({ event }: { event: BillingEventName }) {
  useEffect(() => {
    track(event);
  }, [event]);

  return null;
}
