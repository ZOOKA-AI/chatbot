export function refreshAgentQuotaIfNeeded({
  refresh,
  agentMode,
  completed,
  interrupted,
  error,
}: {
  refresh: () => void;
  agentMode: boolean;
  completed?: boolean;
  interrupted?: boolean;
  error?: unknown;
}) {
  if (agentMode && (completed || interrupted || error !== undefined)) {
    refresh();
  }
}
