import equal from "fast-deep-equal";

const googleDriveToolNames = new Set([
  "tool-searchGoogleDrive",
  "tool-readGoogleDriveFile",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hasApprovedGoogleDriveCall(
  messages: readonly unknown[] | undefined
) {
  return (
    messages?.some(
      (message) =>
        isRecord(message) &&
        Array.isArray(message.parts) &&
        message.parts.some(
          (part) =>
            isRecord(part) &&
            typeof part.type === "string" &&
            googleDriveToolNames.has(part.type) &&
            part.state === "approval-responded" &&
            isRecord(part.approval) &&
            part.approval.approved === true
        )
    ) ?? false
  );
}

export function hasUnverifiedApprovedGoogleDriveCall(
  messages: readonly unknown[] | undefined,
  persistedMessages: readonly {
    id: string;
    parts: unknown;
    role: string;
  }[]
) {
  return (
    messages?.some(
      (message) =>
        isRecord(message) &&
        typeof message.id === "string" &&
        message.role === "assistant" &&
        Array.isArray(message.parts) &&
        message.parts.some((part) => {
          if (
            !isRecord(part) ||
            typeof part.type !== "string" ||
            !googleDriveToolNames.has(part.type) ||
            part.state !== "approval-responded" ||
            !isRecord(part.approval) ||
            part.approval.approved !== true ||
            typeof part.approval.id !== "string" ||
            typeof part.toolCallId !== "string"
          ) {
            return false;
          }

          const clientApproval = part.approval;
          return !persistedMessages.some(
            (persistedMessage) =>
              persistedMessage.id === message.id &&
              persistedMessage.role === "assistant" &&
              Array.isArray(persistedMessage.parts) &&
              persistedMessage.parts.some((persistedPart) => {
                const persistedApproval = isRecord(persistedPart)
                  ? persistedPart.approval
                  : undefined;
                return (
                  isRecord(persistedPart) &&
                  persistedPart.type === part.type &&
                  persistedPart.state === "approval-requested" &&
                  persistedPart.toolCallId === part.toolCallId &&
                  equal(persistedPart.input, part.input) &&
                  isRecord(persistedApproval) &&
                  persistedApproval.id === clientApproval.id
                );
              })
          );
        })
    ) ?? false
  );
}

export function hasPendingToolApproval(
  messages: readonly unknown[],
  existingMessageIds: ReadonlySet<string> = new Set()
) {
  return messages.some(
    (message) =>
      isRecord(message) &&
      typeof message.id === "string" &&
      !existingMessageIds.has(message.id) &&
      Array.isArray(message.parts) &&
      message.parts.some(
        (part) => isRecord(part) && part.state === "approval-requested"
      )
  );
}

export function isAgentAccessAuthorized({
  agentMode,
  supportsTools,
  monthlyAgentRuns,
  agentRunsUsed,
  quotaAllowed,
}: {
  agentMode: boolean;
  supportsTools: boolean;
  monthlyAgentRuns: number;
  agentRunsUsed: number;
  quotaAllowed: boolean;
}) {
  return (
    agentMode &&
    supportsTools &&
    monthlyAgentRuns > 0 &&
    agentRunsUsed < monthlyAgentRuns &&
    quotaAllowed
  );
}
