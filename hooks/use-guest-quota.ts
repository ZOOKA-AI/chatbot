"use client";

import { useMemo } from "react";
import { GUEST_FREE_MESSAGES } from "@/lib/copy";

const STORAGE_KEY = "zooka_guest_messages";

function readCount() {
  try {
    const value = Number.parseInt(localStorage.getItem(STORAGE_KEY) ?? "0", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeCount(count: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(count));
  } catch {
    // Storage may be unavailable; the server still enforces the limit.
  }
}

// Client-side counter for the guest free-message allowance. The server is the
// source of truth; this only lets the UI react without a failed request.
export function useGuestQuota() {
  return useMemo(
    () => ({
      isExhausted: () => readCount() >= GUEST_FREE_MESSAGES,
      consume: () => writeCount(readCount() + 1),
      markExhausted: () => writeCount(GUEST_FREE_MESSAGES),
    }),
    []
  );
}
