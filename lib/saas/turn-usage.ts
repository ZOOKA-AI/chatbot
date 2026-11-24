/**
 * Whether a finished chat turn is billable.
 *
 * REQUEST_ATTEMPTED  every turn that reaches the model
 * REQUEST_FAILED     the provider errored (onError fired)
 * BILLABLE_USAGE     the turn produced assistant output, even if it was later cut
 *                    off: a provider that streamed tokens has charged for them
 *
 * A failed turn with no assistant output (the provider refused, the key was
 * missing, the model id was unknown) is not billable. It is still recorded, as
 * the non-quota event "chat_failed", so attempts and failures stay visible.
 */

type Part = { type?: unknown; text?: unknown };
type Message = { role?: unknown; parts?: unknown };

export function assistantProducedOutput(messages: readonly Message[], priorIds: ReadonlySet<string> = new Set()): boolean {
  return messages.some((message) => {
    if (message.role !== "assistant") return false;
    if (typeof (message as { id?: unknown }).id === "string" && priorIds.has((message as { id: string }).id)) {
      return false;
    }
    const parts = Array.isArray(message.parts) ? (message.parts as Part[]) : [];
    return parts.some((part) => {
      if (part?.type === "text" || part?.type === "reasoning") {
        return typeof part.text === "string" && part.text.trim().length > 0;
      }
      return typeof part?.type === "string" && part.type.startsWith("tool-");
    });
  });
}

export type TurnOutcome = "billable" | "failed_unbilled";

export function classifyTurn(input: {
  modelFailed: boolean;
  messages: readonly Message[];
  priorIds?: ReadonlySet<string>;
}): TurnOutcome {
  if (!input.modelFailed) return "billable";
  return assistantProducedOutput(input.messages, input.priorIds) ? "billable" : "failed_unbilled";
}
