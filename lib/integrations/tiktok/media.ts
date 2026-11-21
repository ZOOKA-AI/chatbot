import "server-only";

/**
 * Fetching the video a queued job points at.
 *
 * The URL comes from a caller (Studio, or an n8n job body), so it is treated as
 * hostile input. A server that fetches arbitrary URLs is an SSRF primitive: the
 * sandbox can reach the metadata service and the private network, so the guard
 * rejects anything that is not a public HTTPS address before a socket opens.
 */

export const MAX_MEDIA_BYTES = 128 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 120_000;

function isPrivateIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) {
    return false;
  }
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

export interface MediaUrlCheck {
  ok: boolean;
  problem?: string;
}

/** Pure so the rules can be asserted without a network or a server context. */
export function checkMediaUrl(raw: string): MediaUrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, problem: "invalid_url" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, problem: "https_required" };
  }
  if (url.username || url.password) {
    return { ok: false, problem: "credentials_in_url" };
  }
  if (url.port && url.port !== "443") {
    return { ok: false, problem: "port_not_allowed" };
  }
  const host = url.hostname.toLowerCase();
  // Bracketed IPv6 literals are refused outright: no media CDN needs one, and
  // classifying every v6 range correctly is not worth the risk here.
  if (host.startsWith("[") || host.includes(":")) {
    return { ok: false, problem: "ip_literal_not_allowed" };
  }
  if (!host.includes(".")) {
    return { ok: false, problem: "internal_hostname" };
  }
  if (host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") {
    return { ok: false, problem: "internal_hostname" };
  }
  if (isPrivateIpv4(host)) {
    return { ok: false, problem: "private_address" };
  }
  return { ok: true };
}

export interface MediaPayload {
  bytes: Buffer;
  mime: string;
}

export type MediaFetchResult =
  | { ok: true; value: MediaPayload }
  | { ok: false; error: string };

export async function fetchMedia(
  raw: string,
  maxBytes: number = MAX_MEDIA_BYTES
): Promise<MediaFetchResult> {
  const check = checkMediaUrl(raw);
  if (!check.ok) {
    return { ok: false, error: check.problem ?? "invalid_url" };
  }
  let response: Response;
  try {
    response = await fetch(raw, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "ZOOKA-AI/1.0 (+https://zooka-ai.com)" },
    });
  } catch {
    return { ok: false, error: "media_unreachable" };
  }
  if (!response.ok) {
    return { ok: false, error: `media_status_${response.status}` };
  }
  // A redirect can land anywhere, so the final URL is checked again.
  const finalCheck = checkMediaUrl(response.url);
  if (!finalCheck.ok) {
    return { ok: false, error: `redirect_${finalCheck.problem ?? "blocked"}` };
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    return { ok: false, error: "media_too_large" };
  }
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  let bytes: Buffer;
  try {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      return { ok: false, error: "media_too_large" };
    }
    bytes = buffer;
  } catch {
    return { ok: false, error: "media_read_failed" };
  }
  return { ok: true, value: { bytes, mime } };
}
