import { ChatbotError } from "@/lib/errors";

export type AgentModeError = "unsupported_model" | "plan_required" | "quota";

const agentModeErrors = {
  unsupported_model: {
    code: "bad_request:api",
    cause:
      "Agent mode is unavailable with this model. Choose a tool-capable model.",
  },
  plan_required: {
    code: "forbidden:chat",
    cause: "Agent mode requires a Pro or Business workspace plan.",
  },
  quota: {
    code: "rate_limit:chat",
    cause: "This workspace has reached its monthly agent run limit.",
  },
} as const;

export function agentModeErrorResponse(error: AgentModeError) {
  const { code, cause } = agentModeErrors[error];
  return new ChatbotError(code, cause).toResponse();
}
