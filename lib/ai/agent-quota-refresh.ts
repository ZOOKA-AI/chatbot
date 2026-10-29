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
  if (agentMode && (completed || error !== undefined)) {
    refresh();
  }
}
