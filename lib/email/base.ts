/**
 * Where the links inside a mail point.
 *
 * A mail leaves the app and is read somewhere else, so its links must not point
 * at the deployment that happened to send it. A preview alias is ephemeral and
 * often protected: the recipient of a reset mail that was sent from an
 * acceptance deployment landed on a login wall instead of the reset form, and
 * the header logo came through as a broken image because the mail client could
 * not fetch it from the same host.
 *
 * Kept free of `server-only` so the rule can be unit tested directly.
 */
export const CANONICAL_APP_ORIGIN = "https://zooka-ai.com";

export type EmailBaseEnv = {
  EMAIL_PUBLIC_BASE_URL?: string | undefined;
  NEXT_PUBLIC_APP_URL?: string | undefined;
};

function originOf(value: string): string | null {
  try {
    const { protocol, hostname } = new URL(value);
    if (!hostname) return null;
    return `${protocol}//${hostname}`;
  } catch {
    return null;
  }
}

/**
 * Rules, in order:
 *  1. EMAIL_PUBLIC_BASE_URL wins, so an isolated run can deliberately target
 *     itself when the token really does only exist there.
 *  2. NEXT_PUBLIC_APP_URL on a real domain is honoured (custom domain, staging).
 *  3. Anything else - no value, or a *.vercel.app deployment host - falls back to
 *     the canonical production origin.
 */
export function resolveEmailBase(env: EmailBaseEnv = {
  EMAIL_PUBLIC_BASE_URL: process.env.EMAIL_PUBLIC_BASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
}): string {
  const explicit = env.EMAIL_PUBLIC_BASE_URL?.trim();
  if (explicit) {
    const origin = originOf(explicit);
    if (origin) return origin;
  }

  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const origin = originOf(configured);
    if (origin && !new URL(configured).hostname.endsWith(".vercel.app")) {
      return origin;
    }
  }

  return CANONICAL_APP_ORIGIN;
}
