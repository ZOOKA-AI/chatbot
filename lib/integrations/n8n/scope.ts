import "server-only";

/**
 * Which workflows a workspace may see.
 *
 * One n8n instance serves two businesses (ZOOKA-AI and ROYAL HAROON), and the
 * admin view listed all of them inside one workspace's panel: 80 workflows, of
 * which 63 belong to the other project. Project separation is a standing owner
 * rule, so the instance is scoped by an explicit list rather than by guessing
 * from names.
 *
 * N8N_WORKFLOW_SCOPE is a comma-separated list of workflow ids. Unset or empty
 * means "no scope" and every workflow is shown, which is the right default for a
 * customer's own single-purpose instance. Set it, and anything not listed is
 * hidden instead of silently attributed to this workspace.
 */
export function readWorkflowScope(value: string | undefined): Set<string> | null {
  const ids = (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

export function workflowScope(): Set<string> | null {
  return readWorkflowScope(process.env.N8N_WORKFLOW_SCOPE);
}

export function isInScope(id: string, scope: Set<string> | null): boolean {
  return scope === null || scope.has(id);
}
