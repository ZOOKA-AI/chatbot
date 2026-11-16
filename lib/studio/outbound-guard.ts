import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

import { assessUrl } from "@/lib/browser/url-policy";

/**
 * What a self-hosted provider endpoint is allowed to reach, on every hop.
 *
 * ComfyUI takes a URL from configuration and then follows it. That is the shape of an SSRF: the first
 * request is the one an operator configured, but a redirect, a returned output URL or a DNS record can
 * point the second request at 169.254.169.254 or at the database. The browser already has a policy for
 * this; the gateway did not, and the audit said so.
 *
 * Rules, in order:
 *
 *   1. the URL must pass the same assessment the browser uses (protocol, credentials, host suffixes)
 *   2. a metadata address is refused always, with no flag and no exception
 *   3. a private or loopback address needs an explicit owner acknowledgement, because a self-hosted GPU
 *      worker on a LAN is a legitimate deployment and 10.x is also where the database lives
 *   4. redirects are not followed by fetch; each hop is assessed before it is requested
 */

const METADATA_ADDRESSES = new Set([
  "169.254.169.254", // AWS, GCP, Azure, DigitalOcean
  "169.254.170.2", // ECS task metadata
  "100.100.100.200", // Alibaba
  "fd00:ec2::254", // AWS IPv6
]);

/** The metadata endpoints and the usual private ranges, named so a refusal can say which one. */
export function isMetadataAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  if (METADATA_ADDRESSES.has(normalized)) return true;
  return normalized.startsWith("169.254.");
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80") ||
      normalized === "::"
    );
  }
  return true;
}

export type GuardEnv = Record<string, string | undefined>;

/** Private networks are opt-in, and the opt-in is two deliberate settings, not one. */
export function privateAllowed(env: GuardEnv = process.env): boolean {
  if (env.COMFYUI_ALLOW_PRIVATE_NETWORK !== "1") return false;
  // A production deployment has no business reaching a LAN GPU worker through the app's own network.
  if (env.VERCEL_ENV === "production" || env.ZOOKA_ENV === "production") return false;
  return true;
}

export type GuardResult =
  | { ok: true; url: string; addresses: string[] }
  | { ok: false; reason: string; detail?: string };

/**
 * Assesses one URL, resolving it, because a hostname is a promise the operator does not control.
 */
export async function assessOutbound(
  raw: string,
  options: { env?: GuardEnv; resolve?: (hostname: string) => Promise<string[]> } = {}
): Promise<GuardResult> {
  const env = options.env ?? process.env;

  // The browser's policy covers protocol, credentials, blocked suffixes and DNS, and it is reused rather
  // than re-implemented so the two cannot drift apart.
  const base = await assessUrl(raw, { resolve: options.resolve });
  const rawHost = (() => {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  const addresses = base.ok ? base.addresses : base.reason ? await safeResolve(raw, options.resolve) : [];
  for (const address of addresses) {
    if (isMetadataAddress(address) || isMetadataAddress(rawHost)) {
      return { ok: false, reason: "metadata_endpoint", detail: address };
    }
  }

  if (base.ok) return { ok: true, url: base.url, addresses: base.addresses };

  // The browser policy refuses private and loopback hosts outright. A self-hosted worker may legitimately
  // live there, so that specific refusal is re-considered under the acknowledgement.
  const reconsider = base.reason === "private_address" || base.reason === "host_not_allowed";
  if (reconsider && privateAllowed(env) && addresses.length > 0 && addresses.every((a) => !isMetadataAddress(a))) {
    return { ok: true, url: raw, addresses };
  }
  return { ok: false, reason: base.reason, detail: base.detail };
}

async function safeResolve(
  raw: string,
  resolve?: (hostname: string) => Promise<string[]>
): Promise<string[]> {
  try {
    const hostname = new URL(raw).hostname;
    if (isIP(hostname) !== 0) return [hostname];
    const resolver = resolve ?? (async (name: string) => (await lookup(name, { all: true, verbatim: true })).map((r) => r.address));
    return await resolver(hostname);
  } catch {
    return [];
  }
}

/**
 * fetch, with every hop assessed.
 *
 * Redirects are handled by hand so that a 302 to the metadata service is a refusal rather than a request.
 */
export async function guardedFetch(
  raw: string,
  init: RequestInit = {},
  options: { env?: GuardEnv; fetchImpl?: typeof fetch; maxHops?: number; resolve?: (hostname: string) => Promise<string[]> } = {}
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const maxHops = options.maxHops ?? 3;
  let current = raw;
  let method = init.method ?? "GET";
  let body = init.body;

  for (let hop = 0; hop <= maxHops; hop += 1) {
    const verdict = await assessOutbound(current, options);
    if (!verdict.ok) {
      throw new OutboundBlocked(verdict.reason, current, verdict.detail);
    }

    const response = await doFetch(current, { ...init, method, body, redirect: "manual" });

    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) return response;

    // 303, and 301/302 on POST, become a GET without a body, which is what the client would have done.
    const next = new URL(location, current).toString();
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method !== "GET" && method !== "HEAD")) {
      method = "GET";
      body = undefined;
    }
    current = next;
  }
  throw new OutboundBlocked("too_many_redirects", raw);
}

export class OutboundBlocked extends Error {
  constructor(
    public reason: string,
    public url: string,
    public detail?: string
  ) {
    super(`outbound_blocked:${reason}`);
    this.name = "OutboundBlocked";
  }
}
