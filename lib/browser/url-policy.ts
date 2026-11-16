import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * What the customer browser is allowed to reach.
 *
 * The browser runs on the same machine as the application and its database, so an unchecked URL is
 * not a browsing request, it is a request from inside the network: cloud metadata at
 * 169.254.169.254, the Postgres port on loopback, a container name on the internal DNS. The policy
 * therefore decides on the resolved address, not on the hostname the customer typed, because a
 * hostname is a promise the attacker controls.
 *
 * One limit is stated rather than hidden: the check happens before navigation, so a DNS record that
 * changes between the check and the browser's own resolution could still reach a private address.
 * Closing that fully needs a proxy that re-validates the connection; it is not done here.
 */

export type UrlAssessment =
  | { ok: true; url: string; hostname: string; addresses: string[] }
  | { ok: false; reason: string; detail?: string };

const BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localhost", ".lan", ".home", ".corp", ".intranet"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata", "metadata.google.internal", "instance-data"]);
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Loopback, for controlled testing only, and never in a deployment.
 *
 * `next start` sets NODE_ENV=production on a developer machine, so NODE_ENV cannot distinguish a
 * deployed instance from a local one. The distinction is made on the deployment markers instead,
 * and it takes two deliberate settings to open loopback: the port must be named, and the
 * acknowledgement flag must be set. A deployment cannot satisfy the second one by accident.
 */
export function loopbackAllowed(
  port: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.VERCEL_ENV === "production" || env.ZOOKA_ENV === "production") return false;
  if (env.BROWSER_LOOPBACK_ACKNOWLEDGED !== "1") return false;
  const allowed = (env.BROWSER_ALLOW_LOOPBACK ?? "")
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  return allowed.includes(port);
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, includes cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true;
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalised = address.toLowerCase();
  if (normalised === "::" || normalised === "::1") return true;
  if (normalised.startsWith("fe80") || normalised.startsWith("fc") || normalised.startsWith("fd")) return true;
  if (normalised.startsWith("::ffff:")) return isPrivateIpv4(normalised.slice(7));
  return false;
}

function addressIsPrivate(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true; // not an address we understand is not an address we allow
}

/**
 * Assess a URL the customer or the agent asked for.
 * `resolve` is injectable so tests can describe DNS instead of depending on it.
 */
export async function assessUrl(
  raw: string,
  options: { resolve?: (hostname: string) => Promise<string[]> } = {}
): Promise<UrlAssessment> {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty_url" };
  if (trimmed.length > 2048) return { ok: false, reason: "url_too_long" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { ok: false, reason: "protocol_not_allowed", detail: url.protocol };
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) return { ok: false, reason: "host_not_allowed", detail: hostname };
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { ok: false, reason: "host_not_allowed", detail: hostname };
  }

  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const literal = isIP(hostname) !== 0;
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  if (literal) {
    if (addressIsPrivate(hostname) && !(loopback && loopbackAllowed(port))) {
      return { ok: false, reason: "private_address", detail: hostname };
    }
    return { ok: true, url: url.toString(), hostname, addresses: [hostname] };
  }
  if (loopback && !loopbackAllowed(port)) {
    return { ok: false, reason: "host_not_allowed", detail: hostname };
  }

  const resolver =
    options.resolve ??
    (async (name: string) => {
      const records = await lookup(name, { all: true, verbatim: true });
      return records.map((record) => record.address);
    });

  let addresses: string[];
  try {
    addresses = await resolver(hostname);
  } catch {
    return { ok: false, reason: "dns_lookup_failed", detail: hostname };
  }
  if (addresses.length === 0) return { ok: false, reason: "dns_lookup_failed", detail: hostname };

  // Every address the name resolves to must be public: a name that answers with one public and one
  // private address is a name that is trying to reach the network behind us.
  const blocked = addresses.filter(addressIsPrivate);
  if (blocked.length > 0 && !(loopback && loopbackAllowed(port))) {
    return { ok: false, reason: "private_address", detail: blocked[0] };
  }

  return { ok: true, url: url.toString(), hostname, addresses };
}
