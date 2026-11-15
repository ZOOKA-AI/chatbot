/**
 * Which actions the interface may offer.
 *
 * One function decides for the buttons, and the tests import the same function,
 * so what is shown and what is asserted cannot drift apart. This is presentation
 * only: the server re-checks every call, and a wrong answer here would produce a
 * refused request, never an unauthorised action.
 */

export type CommanderAction = "create" | "cancel" | "retry" | "decide";

/** Statuses in which a task is still open and can be stopped. */
export const CANCELLABLE = ["pending", "in_progress"] as const;

/** Statuses the server will accept a retry from. */
export const RETRYABLE = ["failed", "cancelled"] as const;

export function canOffer(
  action: CommanderAction,
  input: { canManage: boolean; status?: string | null }
): boolean {
  // Every state change here is a management action; a member reads only.
  if (!input.canManage) return false;
  const status = input.status ?? "";

  switch (action) {
    case "create":
      return true;
    case "cancel":
      return (CANCELLABLE as readonly string[]).includes(status);
    case "retry":
      return (RETRYABLE as readonly string[]).includes(status);
    case "decide":
      return status === "pending";
    default:
      return false;
  }
}

/**
 * A retry is offered but the server may still refuse it, and the screen has to be
 * able to say why before the click: a rejected approval is a refusal that no
 * amount of retrying will lift.
 */
export function retryBlockedReason(
  task: { status: string; approvalRequired: boolean },
  approvalStatus: string | null
): "approval_rejected" | null {
  if (task.approvalRequired && approvalStatus === "rejected") return "approval_rejected";
  return null;
}
