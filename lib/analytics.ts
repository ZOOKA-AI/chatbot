import { track } from "@vercel/analytics";

export type FunnelEvent =
  | "click_upgrade"
  | "checkout_started"
  | "checkout_success"
  | "paywall_shown"
  | "manage_subscription_clicked";

export function trackEvent(
  event: FunnelEvent,
  props?: Record<string, string | number | boolean>
) {
  try {
    track(event, props);
  } catch {
    // analytics must never break the UI
  }
}
