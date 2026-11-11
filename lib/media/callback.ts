import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

const hexSignature = /^[a-f0-9]{64}$/;

export function mediaSignatureMatches(
  body: Uint8Array,
  signature: string | null,
  secret: string
) {
  if (!signature || !hexSignature.test(signature)) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function isAllowedMediaAsset(value: string, allowedHosts: string) {
  try {
    const url = new URL(value);
    const hosts = allowedHosts
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      !url.hash &&
      !isIP(url.hostname.replace(/^\[|\]$/g, "")) &&
      url.hostname !== "localhost" &&
      !url.hostname.endsWith(".localhost") &&
      hosts.includes(url.hostname)
    );
  } catch {
    return false;
  }
}
