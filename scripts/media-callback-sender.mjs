import { createHmac } from "node:crypto";

/**
 * Reference generator-side sender. Import this from the trusted worker only.
 * callbackUrl and secret MUST come from operator configuration, never job input.
 * The caller owns retry scheduling; 4xx errors must not be retried blindly.
 */
export function createMediaCallbackRequest(payload, { callbackUrl, secret }) {
  const target = new URL(callbackUrl);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/api/media-engine/callback"
  ) {
    throw new Error(
      "Configure an HTTPS callback URL with the exact callback path"
    );
  }
  if (typeof secret !== "string" || !secret.trim()) {
    throw new Error(
      "Configure the shared callback secret in the worker environment"
    );
  }
  // Serialize once, then sign and send these same UTF-8 bytes.
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  if (body.byteLength > 16_384) {
    throw new Error("Callback exceeds 16 KiB");
  }
  return new Request(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-zooka-signature": createHmac("sha256", secret)
        .update(body)
        .digest("hex"),
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
}

export async function sendMediaCallback(payload, config) {
  const response = await fetch(createMediaCallbackRequest(payload, config));
  if (!response.ok) {
    // Do not include response bodies, secrets, URLs or provider details in errors.
    throw new Error(`Callback returned HTTP ${response.status}`);
  }
  const data = await response.json();
  if (!data || data.ok !== true || typeof data.ignored !== "boolean") {
    throw new Error("Invalid callback acknowledgement");
  }
  return { ok: true, ignored: data.ignored };
}
