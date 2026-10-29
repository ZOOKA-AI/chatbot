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

export function hasPendingToolApproval(messages: readonly unknown[]) {
  return messages.some(
    (message) =>
      isRecord(message) &&
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
