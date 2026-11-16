import "server-only";

import { CONNECTOR_SPECS } from "@/lib/integrations/connectors/registry";
import { INTEGRATION_PLAYBOOKS } from "@/lib/integrations/playbooks";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers";

/**
 * The capability matrix the release is judged on. It is built from code, not
 * from prose: a column is only true when the code that satisfies it exists.
 * Nothing here claims a live verification: authentication and read proofs are
 * recorded by the executor when a tenant actually connects and runs a read.
 */
export type MatrixRow = {
  providerId: string;
  /** Canonical display name from the provider catalogue — never inferred. */
  name: string;
  nameAr: string;
  /** Catalogue status, so the agent reports what the UI actually shows. */
  catalogStatus: string;
  label: string;
  documentationReady: boolean;
  providerImplemented: boolean;
  authenticationVerified: boolean;
  readOperationsVerified: boolean;
  writeOperationsVerified: boolean;
  agentToolsVerified: boolean;
  multiTenantIsolationVerified: boolean;
  readOperations: string[];
  writeStatus: string | null;
  blockers: string[];
};

/** Providers implemented with a hand-written module rather than a spec. */
const BESPOKE_IMPLEMENTED = new Set([
  "instagram",
  "meta",
  "linkedin",
  "snapchat",
  "telegram_ads",
  "telegram_bot",
  "improvmx",
  "google_ads",
  "gmail",
  "google_drive",
  "google_calendar",
  "github",
  "vercel",
  "supabase",
  "n8n",
]);

/** Providers that expose agent tools today (bespoke tools or the generic runner). */
const BESPOKE_AGENT_TOOLS = new Set([
  "instagram",
  "meta",
  "linkedin",
  "snapchat",
  "telegram_ads",
  "telegram_bot",
  "improvmx",
  "google_ads",
  "gmail",
  "google_drive",
  "google_calendar",
  "github",
  "n8n",
  // Declared in the catalog and reachable through the shared OAuth/token store.
  "vercel",
  "supabase",
]);

/**
 * Credentials for every row live in integration_connection, keyed by
 * workspace_id and encrypted with AES-256-GCM, so isolation is structural: the
 * executor can only fetch a credential by passing the calling workspace.
 */
const ISOLATED = new Set([...BESPOKE_IMPLEMENTED, ...CONNECTOR_SPECS.map((s) => s.providerId)]);

export function buildIntegrationMatrix(): MatrixRow[] {
  const specByProvider = new Map(
    CONNECTOR_SPECS.map((spec) => [spec.providerId, spec])
  );
  const catalogById = new Map(
    INTEGRATION_PROVIDERS.map((provider) => [provider.id, provider])
  );
  const rows: MatrixRow[] = [];

  for (const playbook of INTEGRATION_PLAYBOOKS) {
    const spec = specByProvider.get(playbook.providerId);
    // The catalogue is the single source of truth for names. A row without a
    // catalogue entry would force the agent to guess a name, which is exactly
    // the defect this guards against, so it fails instead.
    const catalogEntry = catalogById.get(playbook.providerId);
    if (!catalogEntry) {
      throw new Error(
        `provider ${playbook.providerId} is missing from INTEGRATION_PROVIDERS`
      );
    }
    const implemented = Boolean(spec) || BESPOKE_IMPLEMENTED.has(playbook.providerId);
    rows.push({
      providerId: playbook.providerId,
      name: catalogEntry.name,
      nameAr: catalogEntry.nameAr,
      catalogStatus: catalogEntry.status,
      label: catalogEntry.name,
      documentationReady: true,
      providerImplemented: implemented,
      authenticationVerified: false,
      readOperationsVerified: false,
      writeOperationsVerified: false,
      agentToolsVerified:
        Boolean(spec) || BESPOKE_AGENT_TOOLS.has(playbook.providerId),
      multiTenantIsolationVerified: ISOLATED.has(playbook.providerId),
      readOperations: spec ? spec.operations.filter((op) => op.kind === "read").map((op) => op.id) : [],
      writeStatus: spec ? spec.writeStatus : null,
      blockers: spec ? spec.blockers : [],
    });
  }

  // A connector without a playbook would be undocumented; fail loudly instead of
  // shipping half a provider.
  for (const spec of CONNECTOR_SPECS) {
    if (!rows.some((row) => row.providerId === spec.providerId)) {
      throw new Error(`connector ${spec.providerId} has no playbook entry`);
    }
  }

  return rows;
}

export function matrixTotals(rows: MatrixRow[]) {
  return {
    total: rows.length,
    documented: rows.filter((row) => row.documentationReady).length,
    implemented: rows.filter((row) => row.providerImplemented).length,
    withAgentTools: rows.filter((row) => row.agentToolsVerified).length,
    multiTenant: rows.filter((row) => row.multiTenantIsolationVerified).length,
    withBlockers: rows.filter((row) => row.blockers.length > 0).length,
  };
}

export function renderMatrixMarkdown(rows: MatrixRow[]) {
  const header =
    "| Provider | Docs | Implemented | Auth verified | Reads verified | Writes verified | Agent tools | Isolation |\n" +
    "| --- | --- | --- | --- | --- | --- | --- | --- |\n";
  const body = rows
    .map((row) =>
      [
        row.providerId,
        row.documentationReady ? "yes" : "no",
        row.providerImplemented ? "yes" : "no",
        row.authenticationVerified ? "yes" : "no",
        row.readOperationsVerified ? "yes" : "no",
        row.writeOperationsVerified ? "yes" : "no",
        row.agentToolsVerified ? "yes" : "no",
        row.multiTenantIsolationVerified ? "yes" : "no",
      ].join(" | ")
    )
    .map((line) => `| ${line} |`)
    .join("\n");
  return header + body;
}
