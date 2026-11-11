import { createHmac, timingSafeEqual } from "node:crypto";

function sameLengthEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/** Verifies a Meta-style `sha256=<hex>` HMAC header against the raw request body. */
export function verifyHmacSha256(
  rawBody: string,
  header: string | null,
  secret: string | undefined
): boolean {
  if (!(header && secret)) {
    return false;
  }
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  return sameLengthEqual(header, `sha256=${digest}`);
}

/** Constant-time comparison for a shared secret header (no prefix, no hashing). */
export function verifySharedSecret(
  header: string | null,
  secret: string | undefined
): boolean {
  if (!(header && secret)) {
    return false;
  }
  return sameLengthEqual(header, secret);
}
