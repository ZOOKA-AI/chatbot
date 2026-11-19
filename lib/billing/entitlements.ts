import { GUEST_FREE_MESSAGES } from "@/lib/copy";
import { workspacePlans } from "@/lib/saas/plans";

/**
 * One plan contract for the whole site.
 *
 * Marketing copy, the pricing cards, the demo widget and the post-sign-up
 * notice all read from here. Numbers come from `workspacePlans` (the values
 * Stripe and the API enforce), so the page can never promise a limit the
 * server does not honour.
 */
export const PLANS = {
  guest: {
    dailyMessages: GUEST_FREE_MESSAGES,
    gmail: false,
    drive: false,
    agentMode: false,
  },
  free: {
    monthlyMessages: workspacePlans.free.monthlyMessages,
    models: "basic" as const,
    gmail: false,
    drive: false,
    agentMode: false,
    integrations: false,
  },
  pro: {
    priceUsd: workspacePlans.pro.price,
    monthlyMessages: workspacePlans.pro.monthlyMessages,
    agentRuns: workspacePlans.pro.monthlyAgentRuns,
    webSearch: workspacePlans.pro.monthlyWebSearches,
    models: "advanced" as const,
    gmail: true,
    drive: true,
    agentMode: true,
    integrations: "catalog" as const,
  },
  business: {
    priceUsd: workspacePlans.business.price,
    monthlyMessages: workspacePlans.business.monthlyMessages,
    agentRuns: workspacePlans.business.monthlyAgentRuns,
    webSearch: workspacePlans.business.monthlyWebSearches,
    models: "advanced" as const,
    gmail: true,
    drive: true,
    agentMode: true,
    integrations: "catalog" as const,
  },
} as const;

export type PlanKey = keyof typeof PLANS;

const numberFormat = (value: number, lang: "ar" | "en") =>
  value.toLocaleString(lang === "ar" ? "ar-EG" : "en-US");

/**
 * The two bullets per plan that must never drift from the contract: the free
 * tier explicitly has no tool connections and no Agent mode, and Pro is where
 * Gmail/Drive and Agent mode begin.
 */
export function planFeatures(lang: "ar" | "en") {
  const ar = lang === "ar";
  return {
    free: [
      ar
        ? `${numberFormat(PLANS.free.monthlyMessages, lang)} رسالة شهريًا`
        : `${numberFormat(PLANS.free.monthlyMessages, lang)} messages / month`,
      ar ? "النماذج الأساسية" : "Basic models",
      ar ? "مساحة عمل واحدة" : "One workspace",
      ar
        ? "بدون ربط أدوات وبدون وضع الوكيل"
        : "No tool connections, no Agent mode",
    ],
    pro: [
      ar
        ? `${numberFormat(PLANS.pro.monthlyMessages, lang)} رسالة شهريًا`
        : `${numberFormat(PLANS.pro.monthlyMessages, lang)} messages / month`,
      ar
        ? `${numberFormat(PLANS.pro.agentRuns, lang)} تشغيل وكيل`
        : `${numberFormat(PLANS.pro.agentRuns, lang)} agent runs`,
      ar
        ? "كل التكاملات المتاحة، ومنها جيميل ودرايف"
        : "All available integrations, including Gmail and Drive",
    ],
    business: [
      ar
        ? `${numberFormat(PLANS.business.monthlyMessages, lang)} رسالة شهريًا`
        : `${numberFormat(PLANS.business.monthlyMessages, lang)} messages / month`,
      ar
        ? `${numberFormat(PLANS.business.agentRuns, lang)} تشغيل وكيل`
        : `${numberFormat(PLANS.business.agentRuns, lang)} agent runs`,
      ar
        ? "كل التكاملات المتاحة، ومنها جيميل ودرايف"
        : "All available integrations, including Gmail and Drive",
    ],
  };
}

/** Honest post-sign-up notice: a free account is a chat, not the agent. */
export function freeUpsell(lang: "ar" | "en") {
  const ar = lang === "ar";
  return ar
    ? `حسابك المجاني يحفظ المحادثة: ${numberFormat(PLANS.free.monthlyMessages, lang)} رسالة شهريًا بنماذج أساسية. ربط جيميل ودرايف ووضع الوكيل يبدآن من باقة الاحترافي.`
    : `A free account saves this chat: ${numberFormat(PLANS.free.monthlyMessages, lang)} messages a month on basic models. Gmail, Drive, and Agent mode start on Pro.`;
}
