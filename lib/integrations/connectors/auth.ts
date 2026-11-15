import type { ConnectorSpec } from "@/lib/integrations/connectors/types";

/**
 * One place that turns a provider's declared auth strategy plus the tenant's
 * parsed credential into request headers. No provider builds its own header
 * inline, so a credential can never be logged or sent in the wrong shape.
 */
export function buildHeaders(
  spec: Pick<ConnectorSpec, "auth">,
  fields: Record<string, string>
): Record<string, string> {
  const auth = spec.auth;
  if (auth.kind === "bearer") {
    return { Authorization: `Bearer ${fields.token ?? ""}` };
  }
  if (auth.kind === "basic") {
    const user = fields[auth.userField] ?? "";
    const password = fields.token ?? "";
    const encoded = Buffer.from(`${user}:${password}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  if (auth.kind === "headers") {
    const out: Record<string, string> = {};
    for (const [name, template] of Object.entries(auth.headers)) {
      out[name] = template.replace(/\{(\w+)\}/g, (_match, key: string) => fields[key] ?? "");
    }
    return out;
  }
  return {};
}

export function describeCredential(
  raw: string,
  parse: (value: string) => Record<string, string>
) {
  const value = raw.trim();
  if (value.length < 8) {
    throw new Error("credential is too short");
  }
  return parse(value);
}
