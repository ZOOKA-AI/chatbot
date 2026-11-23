/**
 * Refusal returned by web tools when the quota check fails.
 *
 * A plan limit of 0 means the feature is not part of the plan, which is not
 * the same as a used-up allowance. Telling a free user that their "monthly
 * credit ran out" reads as a fault, so the two cases get different wording
 * and both point at the upgrade page. `error` is shown to the user as is;
 * `modelNote` tells the model how to phrase its reply.
 */
export type WebQuotaKind = "search" | "read_url";

export const UPGRADE_PATH = "/pricing";

export type WebQuotaRefusal = {
  error: string;
  reason: "not_in_plan" | "exhausted";
  upgradeUrl: string;
  modelNote: string;
};

export function webQuotaRefusal(
  quota: { limit: number },
  kind: WebQuotaKind
): WebQuotaRefusal {
  const what = kind === "search" ? "البحث في الويب" : "قراءة صفحات الويب";
  const whatEn = kind === "search" ? "Web search" : "Reading web pages";
  if (quota.limit <= 0) {
    return {
      reason: "not_in_plan",
      upgradeUrl: UPGRADE_PATH,
      error: `${what} غير متاح في الخطة المجانية، ومتاح في خطة Pro.`,
      modelNote: `${whatEn} is not included in the user's Free plan; it is available on the Pro plan at ${UPGRADE_PATH}. Say so plainly in the user's language, offer to answer from general knowledge, and do not say that a credit, balance or quota ran out or claim to have searched.`,
    };
  }
  return {
    reason: "exhausted",
    upgradeUrl: UPGRADE_PATH,
    error: `استُهلك رصيد ${what} الشهري لمساحة العمل. يتجدد مع بداية الشهر القادم.`,
    modelNote: `The workspace has used its monthly ${whatEn.toLowerCase()} allowance; it renews next month, or the plan can be upgraded at ${UPGRADE_PATH}. Do not claim to have searched.`,
  };
}
