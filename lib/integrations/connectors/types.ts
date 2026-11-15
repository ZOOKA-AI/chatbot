/**
 * Declarative connector layer.
 *
 * Every provider the platform talks to is described once, as data: how a
 * tenant's own credential is parsed, which call proves the credential belongs
 * to that account, and which read operations the agent may run. The executor
 * (execute.ts) is the only code that performs network calls, so encryption,
 * tenant isolation, audit and usage limits are enforced in one place instead of
 * being re-implemented per provider.
 */
export type ConnectorAuth =
  | { kind: "bearer" }
  | { kind: "headers"; headers: Record<string, string> }
  | { kind: "basic"; userField: string }
  | { kind: "query"; params: Record<string, string> };

export type ConnectorOperation = {
  id: string;
  titleEn: string;
  titleAr: string;
  /** read = safe to run from chat. write is declared so the UI/agent can be honest, never executed yet. */
  kind: "read" | "write";
  method: "GET" | "POST";
  /** Builds the absolute URL from parsed credential fields. */
  url: (fields: Record<string, string>) => string;
  body?: (fields: Record<string, string>) => string;
  contentType?: string;
  /** Field in the JSON payload that carries the rows, for compact summaries. */
  collectionPath?: string;
  /** Some providers answer XML (Namecheap); the executor then returns raw text. */
  responseKind?: "json" | "text";
  docsUrl?: string;
};

export type ConnectorSpec = {
  providerId: string;
  label: string;
  labelAr: string;
  /**
   * A tenant always supplies its own credential. "oauth" means the provider has
   * an authorization-code flow that can be enabled once a platform OAuth app
   * exists; "token" means a tenant-scoped key/token is the only route today.
   */
  credentialType: "oauth" | "token";
  /** Human description of the exact value the tenant must paste in the secure card. */
  credentialHintEn: string;
  credentialHintAr: string;
  /**
   * Parses the pasted value into named fields. Compound credentials
   * ("ACxxx:token", "shpat_x|shop.myshopify.com") are split here, never in the UI.
   */
  parse: (raw: string) => Record<string, string>;
  auth: ConnectorAuth;
  verify: { method: "GET" | "POST"; url: (f: Record<string, string>) => string };
  describe: (payload: Record<string, unknown>) => {
    accountId: string | null;
    accountName: string | null;
    extra: Record<string, unknown>;
  };
  operations: ConnectorOperation[];
  /** What blocks this provider today, in provider terms. Empty when nothing blocks it. */
  blockers: string[];
  scopes: string[];
  docsUrl: string;
  /** Why writes are not available, shown instead of a fake publish button. */
  writeStatus: string;
};

export function splitCredential(raw: string, separator = "|") {
  const parts = raw
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts;
}

export function requireFields(
  fields: Record<string, string>,
  names: string[]
) {
  const missing = names.filter((name) => !fields[name]);
  if (missing.length) {
    throw new Error(`missing credential fields: ${missing.join(", ")}`);
  }
  return fields;
}
