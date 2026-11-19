import { describe, expect, it } from "vitest";

import {
  AFTER_REGISTER_PATH,
  type RegisterFeedback,
  type RegisterStatus,
  SUBMIT_LOCK_MS,
  registerFeedback,
} from "@/lib/auth/register-feedback";

/**
 * Regression cover for the reported defect: the registration screen announced
 * "account created successfully", kept its button spinning, and never moved the
 * person to the sign-in form.
 */
const STATUSES: RegisterStatus[] = [
  "idle",
  "in_progress",
  "check_email",
  "unavailable",
  "invalid_data",
  "failed",
];

function toastsOf(feedback: RegisterFeedback) {
  if (feedback.kind === "none") return [];
  if (feedback.kind === "navigate") return [feedback.toast];
  return [{ tone: feedback.tone, text: feedback.text }];
}

describe("registerFeedback", () => {
  it("decides every status instead of falling through", () => {
    for (const status of STATUSES) {
      expect(registerFeedback(status)).toBeTruthy();
    }
  });

  it("never announces more than one message per resolution", () => {
    for (const status of STATUSES) {
      expect(toastsOf(registerFeedback(status)).length).toBeLessThanOrEqual(1);
    }
  });

  it("moves a completed submission to the sign-in form", () => {
    const feedback = registerFeedback("check_email");
    expect(feedback.kind).toBe("navigate");
    if (feedback.kind !== "navigate") throw new Error("unreachable");
    expect(feedback.to).toBe(AFTER_REGISTER_PATH);
    expect(feedback.to).toBe("/login?registered=1");
  });

  it("says the request was received, never that an account exists", () => {
    // The server answers one neutral status for a new and a registered address,
    // so a success claim here is a lie in one of the two cases.
    for (const status of STATUSES) {
      const feedback = registerFeedback(status);
      for (const toast of toastsOf(feedback)) {
        expect(toast.text).not.toBe("success");
        expect(toast.text).not.toMatch(/created|تم إنشاء/);
      }
    }
    const completed = registerFeedback("check_email");
    if (completed.kind !== "navigate") throw new Error("unreachable");
    expect(completed.toast.text).toBe("checkEmail");
  });

  it("reports failures as errors and releases the button", () => {
    for (const status of ["unavailable", "invalid_data", "failed"] as const) {
      const feedback = registerFeedback(status);
      expect(feedback.kind).toBe("toast");
      if (feedback.kind !== "toast") throw new Error("unreachable");
      expect(feedback.tone).toBe("error");
      expect(feedback.lockSubmit).toBe(false);
    }
  });

  it("stays quiet while idle, so a re-render cannot announce twice", () => {
    expect(registerFeedback("idle").kind).toBe("none");
    expect(registerFeedback("in_progress").kind).toBe("none");
  });

  it("bounds the submit lock of the navigation path", () => {
    // The screen unmounts on navigation; the timer is the safety net that makes
    // "spinner forever" impossible if the move does not happen.
    expect(SUBMIT_LOCK_MS).toBeGreaterThan(0);
    expect(SUBMIT_LOCK_MS).toBeLessThanOrEqual(10_000);
  });

  it("treats an unknown status as a failure, not a success", () => {
    const feedback = registerFeedback("something_new" as RegisterStatus);
    expect(feedback.kind).toBe("toast");
    if (feedback.kind !== "toast") throw new Error("unreachable");
    expect(feedback.tone).toBe("error");
    expect(feedback.text).toBe("failed");
  });
});
