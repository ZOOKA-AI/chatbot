"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GUEST_FREE_MESSAGES } from "@/lib/copy";

type QuotaState = {
  used: number;
  limit: number;
  resetsAt: string | null;
  loaded: boolean;
};

/*
 * Client view of the anonymous allowance. The server stays the source of truth
 * (it also enforces a per-IP cap); this only lets the demo show the real
 * remaining count, survive a reload, and refresh by itself at midnight Dubai.
 */
export function useGuestQuota() {
  const [state, setState] = useState<QuotaState>({
    used: 0,
    limit: GUEST_FREE_MESSAGES,
    resetsAt: null,
    loaded: false,
  });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/guest-quota", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        used?: number;
        limit?: number;
        resetsAt?: string | null;
      };
      setState({
        used: Math.max(0, data.used ?? 0),
        limit: data.limit ?? GUEST_FREE_MESSAGES,
        resetsAt: data.resetsAt ?? null,
        loaded: true,
      });
    } catch {
      setState((current) => ({ ...current, loaded: true }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // When the daily window rolls over, reset the count instead of leaving a
  // visitor staring at an exhausted allowance that is actually fresh again.
  useEffect(() => {
    if (!state.resetsAt) {
      return;
    }
    const delay = new Date(state.resetsAt).getTime() - Date.now();
    if (!Number.isFinite(delay) || delay <= 0 || delay > 86_400_000) {
      return;
    }
    const timer = window.setTimeout(() => {
      setState((current) => ({ ...current, used: 0 }));
      void load();
    }, delay + 1000);
    return () => window.clearTimeout(timer);
  }, [load, state.resetsAt]);

  const consume = useCallback(() => {
    setState((current) => ({
      ...current,
      used: Math.min(current.limit, current.used + 1),
    }));
  }, []);

  return useMemo(() => {
    const remaining = Math.max(0, state.limit - state.used);
    return {
      used: state.used,
      limit: state.limit,
      remaining,
      loaded: state.loaded,
      resetsAt: state.resetsAt,
      reload: load,
      consume,
      isExhausted: () => remaining <= 0,
      markExhausted: () =>
        setState((current) => ({ ...current, used: current.limit })),
    };
  }, [consume, load, state]);
}
