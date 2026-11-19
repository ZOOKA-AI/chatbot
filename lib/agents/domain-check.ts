import "server-only";

import { resolveAny } from "node:dns/promises";

/**
 * Is a domain registered?
 *
 * Two read-only public sources, in order, because each alone gives a wrong answer:
 *
 *   1. RDAP over HTTPS - the registry's own record. Authoritative when it answers, and it
 *      differentiates "not found" (registrable) from "I could not tell".
 *   2. DNS - a name with no NS and no A record is very likely free, but DNS says nothing
 *      about a registered domain with no records, so this is only used as a second opinion.
 *
 * The result type has three states rather than a boolean. "Unknown" is the honest answer
 * when both sources fail, and the caller must not turn that into "available": telling a
 * customer a name is free when it is not wastes their time and, if a purchase follows, their
 * money.
 */

export type DomainStatus = "available" | "taken" | "unknown";

export type DomainCheck = {
  domain: string;
  status: DomainStatus;
  /** Which source produced the answer, so the report can be audited. */
  source: "rdap" | "dns" | "none";
  detail?: string;
};

const RDAP_BASES = [
  "https://rdap.verisign.com/com/v1/domain/",
  "https://rdap.org/domain/",
];

function normalise(domain: string): string | null {
  const value = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)) return null;
  return value;
}

export async function checkDomain(
  domain: string,
  deps: { fetchImpl?: typeof fetch; dnsLookup?: (host: string) => Promise<unknown> } = {}
): Promise<DomainCheck> {
  const name = normalise(domain);
  if (!name) return { domain, status: "unknown", source: "none", detail: "malformed_domain" };

  const doFetch = deps.fetchImpl ?? fetch;

  for (const base of RDAP_BASES) {
    try {
      const response = await doFetch(`${base}${name}`, {
        headers: { accept: "application/rdap+json, application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      // 404 from a registry means the name is not registered. 200 means it is.
      if (response.status === 200) return { domain: name, status: "taken", source: "rdap" };
      if (response.status === 404) return { domain: name, status: "available", source: "rdap" };
      // 429 and 5xx say nothing about the domain; try the next base.
    } catch {
      // network failure or timeout: next source
    }
  }

  try {
    const lookup = deps.dnsLookup ?? ((host: string) => resolveAny(host));
    await lookup(name);
    // Any record at all means somebody controls the name.
    return { domain: name, status: "taken", source: "dns", detail: "records_present" };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOTFOUND") {
      // No records is evidence, not proof, so the source is reported alongside it.
      return { domain: name, status: "available", source: "dns", detail: "no_records" };
    }
    return { domain: name, status: "unknown", source: "none", detail: code ?? "lookup_failed" };
  }
}

/** Checks several candidates, and never lets one failure hide the others. */
export async function checkDomains(domains: string[], deps: Parameters<typeof checkDomain>[1] = {}): Promise<DomainCheck[]> {
  const results: DomainCheck[] = [];
  for (const domain of domains.slice(0, 8)) {
    results.push(await checkDomain(domain, deps));
  }
  return results;
}
