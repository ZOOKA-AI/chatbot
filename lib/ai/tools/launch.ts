import { tool } from "ai";
import { z } from "zod";

import { createStoredPlan, getStoredPlan, listStoredPlans } from "@/lib/agents/launch-store";

/**
 * Launch plan tools for the conversation.
 *
 * The same discipline as the Commander tools: the model can create a plan and read its
 * true state, and nothing else. There is no tool here that advances a step, because
 * advancing one means something actually happened, and a sentence in the chat is not that.
 */

const briefSchema = z.object({
  businessName: z.string().min(2).max(120).describe("The business name the customer wants to trade under"),
  industry: z.string().min(2).max(120).describe("What the business does, e.g. 'cleaning services'"),
  city: z.string().min(2).max(80),
  country: z.string().min(2).max(80).describe("ISO code or name, e.g. 'AE'"),
  languages: z.array(z.enum(["ar", "en"])).min(1).describe("Site languages the customer needs"),
  services: z.array(z.string()).optional().describe("The services to build pages for"),
  desiredDomain: z.string().optional(),
  existingAccounts: z.array(z.string()).optional().describe("Social platforms the customer already owns"),
});

export function createLaunchTools(input: { organizationId: string; canManage: boolean }) {
  return {
    createBusinessLaunchPlan: tool({
      description:
        "Turn a business brief into a persisted launch plan and return it. The result lists every step with its real state: READY (the agent can start), AWAITING_APPROVAL (the customer must approve a purchase or a public publish), BLOCKED (the customer must complete a provider's identity check or open the account themselves). Nothing returns as COMPLETED, because nothing has been done yet - never tell the customer a step is finished after calling this. Show them the plan and the approvals it needs.",
      inputSchema: z.object({ brief: briefSchema }),
      execute: async ({ brief }) => {
        if (!input.canManage) {
          return { error: "forbidden", reason: "only an owner or admin can create a launch plan" };
        }
        const plan = await createStoredPlan({ organizationId: input.organizationId, brief });
        return {
          planId: plan.id,
          status: plan.status,
          steps: plan.steps.map((step) => ({
            id: step.id,
            title: step.title,
            state: step.state,
            owner: step.owner,
            gate: step.gate,
          })),
          note: "States are what the platform will really do next, not progress.",
        };
      },
    }),

    readBusinessLaunchPlan: tool({
      description:
        "Read a stored launch plan and the true state of each step. Use it before answering any question about a plan's progress; report what it returns, including steps that are blocked or awaiting approval.",
      inputSchema: z.object({ planId: z.string().uuid().optional() }),
      execute: async ({ planId }) => {
        if (planId) {
          const plan = await getStoredPlan({ organizationId: input.organizationId, planId });
          if (!plan) return { error: "not_found" };
          return { plan };
        }
        const plans = await listStoredPlans({ organizationId: input.organizationId, limit: 5 });
        return {
          plans: plans.map((plan) => ({ id: plan.id, title: plan.title, status: plan.status, createdAt: plan.createdAt })),
          count: plans.length,
        };
      },
    }),
  };
}
