import { ChatbotError } from "@/lib/errors";

export function refreshAgentQuotaIfNeeded({
  refresh,
  agentMode,
  completed,
  error,
}: {
  refresh: () => void;
  agentMode: boolean;
  completed?: boolean;
  error?: unknown;
}) {
  if (
    agentMode &&
    (completed ||
      (error instanceof ChatbotError && error.type === "rate_limit"))
  ) {
    refresh();
  }
}
