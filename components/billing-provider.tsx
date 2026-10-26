"use client";

import { createContext, useContext } from "react";
import type { Lang } from "@/lib/i18n";

export type BillingState = {
  lang: Lang;
  isGuest: boolean;
  isSubscribed: boolean;
  canManageBilling: boolean;
};

const defaultState: BillingState = {
  lang: "ar",
  isGuest: true,
  isSubscribed: false,
  canManageBilling: false,
};

const BillingContext = createContext<BillingState>(defaultState);

export function BillingProvider({
  value,
  children,
}: {
  value: BillingState;
  children: React.ReactNode;
}) {
  return (
    <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
  );
}

export function useBilling() {
  return useContext(BillingContext);
}
