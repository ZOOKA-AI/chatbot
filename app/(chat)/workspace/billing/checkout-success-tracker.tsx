"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

export function CheckoutSuccessTracker() {
  useEffect(() => {
    trackEvent("checkout_success");
  }, []);
  return null;
}
