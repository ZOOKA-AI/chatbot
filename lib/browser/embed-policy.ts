/**
 * Whether a site allows being framed.
 *
 * Two headers decide it, and both are read from the site's own response: X-Frame-Options, and the
 * frame-ancestors directive of Content-Security-Policy. Kept as a pure function so the decision is
 * tested directly instead of inferred from a blank frame in the UI.
 */
export type EmbedReason = "allowed" | "x_frame_options" | "frame_ancestors";

export function frameAncestors(
  policy: string | null | undefined,
): string | null {
  if (!policy) return null;
  const match = policy.match(/frame-ancestors([^;]*)/i);
  return match ? match[1].trim() : null;
}

export function embedVerdict(headers: {
  xFrameOptions?: string | null;
  contentSecurityPolicy?: string | null;
}): { embeddable: boolean; reason: EmbedReason; detail: string | null } {
  const xfo = headers.xFrameOptions?.trim() ?? null;
  if (xfo && /deny|sameorigin/i.test(xfo)) {
    return { embeddable: false, reason: "x_frame_options", detail: xfo };
  }
  const ancestors = frameAncestors(headers.contentSecurityPolicy);
  if (ancestors) {
    // A wildcard or an explicit list that includes any origin is not a refusal we can judge here;
    // only a policy that names origins without a wildcard is treated as refusing our origin.
    const allowsAny = /(^|\s)\*(\s|$)/.test(ancestors);
    const allowsNone = /^'none'$/i.test(ancestors);
    if (allowsNone || !allowsAny) {
      return {
        embeddable: false,
        reason: "frame_ancestors",
        detail: ancestors,
      };
    }
  }
  return {
    embeddable: true,
    reason: "allowed",
    detail: xfo ?? ancestors ?? null,
  };
}
