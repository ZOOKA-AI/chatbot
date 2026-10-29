"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import useSWR from "swr";
import type { Lang } from "@/lib/i18n";

type AgentUsageSnapshot = Pick<
  BillingState,
  "canUseAgentMode" | "hasAgentPlan" | "agentRunsRemaining"
>;

export interface BillingState {
  lang: Lang;
  isGuest: boolean;
  organizationId: string | null;
  isSubscribed: boolean;
  canUseAgentMode: boolean;
  hasAgentPlan: boolean;
  agentRunsRemaining: number;
  canManageBilling: boolean;
  refreshAgentUsage: () => Promise<void>;
}

type BillingValue = Omit<BillingState, "refreshAgentUsage">;

const defaultState: BillingState = {
  lang: "ar",
  isGuest: true,
  organizationId: null,
  isSubscribed: false,
  canUseAgentMode: false,
  hasAgentPlan: false,
  agentRunsRemaining: 0,
  canManageBilling: false,
  refreshAgentUsage: async () => undefined,
};

const BillingContext = createContext<BillingState>(defaultState);

async function fetchAgentUsage(url: string): Promise<AgentUsageSnapshot> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not refresh workspace Agent usage");
  }
  return response.json() as Promise<AgentUsageSnapshot>;
}

export function BillingProvider({
  value,
  children,
}: {
  value: BillingValue;
  children: React.ReactNode;
}) {
  const key =
    value.isGuest || !value.organizationId
      ? null
      : (["/api/billing/agent-usage", value.organizationId] as const);
  const initialUsage: AgentUsageSnapshot = {
    canUseAgentMode: value.canUseAgentMode,
    hasAgentPlan: value.hasAgentPlan,
    agentRunsRemaining: value.agentRunsRemaining,
  };
  const { data: usage = initialUsage, mutate } = useSWR(
    key,
    ([url]) => fetchAgentUsage(url),
    {
      fallbackData: initialUsage,
      revalidateOnMount: false,
    }
  );
  const refreshAgentUsage = useCallback(async () => {
    if (key) {
      await mutate();
    }
  }, [key, mutate]);
  const currentValue = useMemo(
    () => ({ ...value, ...usage, refreshAgentUsage }),
    [value, usage, refreshAgentUsage]
  );

  return (
    <BillingContext.Provider value={currentValue}>
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling() {
  return useContext(BillingContext);
}
