/**
 * What the registration screen does once the server answers.
 *
 * Kept as one pure decision so it can be tested without a browser. The rule
 * that matters: the action answers with a single neutral status for a fresh
 * address and for an already-registered one, so the screen must never claim
 * that an account was created. It may say "your request was received, sign in",
 * and it must move the person to the sign-in form instead of leaving them on a
 * finished form.
 */

export type RegisterStatus =
  | "idle"
  | "in_progress"
  | "check_email"
  | "unavailable"
  | "invalid_data"
  | "failed";

export type RegisterToastText =
  | "checkEmail"
  | "unavailable"
  | "invalid"
  | "failed";

export type RegisterFeedback =
  /** Nothing to announce: the form is still idle or in flight. */
  | { kind: "none" }
  /** One message, no navigation. */
  | {
      kind: "toast";
      tone: "error" | "success";
      text: RegisterToastText;
      lockSubmit: boolean;
    }
  /** One message and a move to the sign-in form. */
  | {
      kind: "navigate";
      to: string;
      toast: { tone: "success"; text: RegisterToastText };
      lockSubmit: true;
    };

/** Where a person goes after submitting, whatever happened to the address. */
export const AFTER_REGISTER_PATH = "/login?registered=1";

/** Milliseconds the submit button stays shut after a resolution that does not unmount. */
export const SUBMIT_LOCK_MS = 4000;

export function registerFeedback(status: RegisterStatus): RegisterFeedback {
  // Exhaustive on purpose: a new status without a decision fails the type
  // check instead of silently doing nothing.
  const decided: Record<RegisterStatus, RegisterFeedback> = {
    idle: { kind: "none" },
    in_progress: { kind: "none" },
    check_email: {
      kind: "navigate",
      to: AFTER_REGISTER_PATH,
      toast: { tone: "success", text: "checkEmail" },
      // The button stays shut while the sign-in form loads, and that screen
      // unmounts this one. The caller bounds the lock so a navigation that
      // never lands cannot leave it spinning forever.
      lockSubmit: true,
    },
    unavailable: {
      kind: "toast",
      tone: "error",
      text: "unavailable",
      lockSubmit: false,
    },
    invalid_data: {
      kind: "toast",
      tone: "error",
      text: "invalid",
      lockSubmit: false,
    },
    failed: {
      kind: "toast",
      tone: "error",
      text: "failed",
      lockSubmit: false,
    },
  };

  return decided[status] ?? {
    // An unknown status is a defect, never a success.
    kind: "toast",
    tone: "error",
    text: "failed",
    lockSubmit: false,
  };
}
