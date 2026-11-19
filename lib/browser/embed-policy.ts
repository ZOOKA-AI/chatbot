/**
 * Whether a site allows being framed, from the embedder's own point of view.
 *
 * Two headers decide it, and both are read from the site's own response: X-Frame-Options, and the
 * frame-ancestors directive of Content-Security-Policy. Kept as a pure function so the decision is
 * tested directly instead of inferred from a blank frame in the UI.
 *
 * The subtlety that used to be wrong: SAMEORIGIN does not mean "nobody may frame me". It means the
 * framing page must be on the same origin. zooka-ai.com sends SAMEORIGIN, so its own panel on
 * zooka-ai.com is exactly the case the header allows, while a preview host or a customer's custom
 * domain is not. The verdict therefore needs to know who is asking, which is why the embedder and
 * the target origin are part of the input and not guessed.
 */
export type EmbedReason = "allowed" | "x_frame_options" | "frame_ancestors";

export type EmbedVerdict = {
  embeddable: boolean;
  reason: EmbedReason;
  detail: string | null;
  /** True when the page being framed lives on the same origin as the app framing it. */
  sameOrigin: boolean;
  /** How the decision was reached, for the panel to explain itself honestly. */
  via: "none" | "same_origin" | "wildcard" | "listed" | "denied";
};

export function frameAncestors(
  policy: string | null | undefined
): string | null {
  if (!policy) return null;
  const match = policy.match(/frame-ancestors([^;]*)/i);
  return match ? match[1].trim() : null;
}

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || raw === "null") return null;
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
    );
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function embedVerdict(
  headers: {
    xFrameOptions?: string | null;
    contentSecurityPolicy?: string | null;
  },
  context: {
    /** Origin of the app that would host the frame, e.g. https://zooka-ai.com */
    embedderOrigin?: string | null;
    /** The URL that is about to be framed, after redirects. */
    targetUrl?: string | null;
  } = {}
): EmbedVerdict {
  const embedder = originOf(context.embedderOrigin);
  const target = originOf(context.targetUrl);
  const sameOrigin = Boolean(embedder && target && embedder === target);
  const xfo = headers.xFrameOptions?.trim() ?? null;

  if (xfo) {
    const value = xfo.toLowerCase();
    if (value === "deny") {
      return {
        embeddable: false,
        reason: "x_frame_options",
        detail: xfo,
        sameOrigin,
        via: "denied",
      };
    }
    if (value === "sameorigin") {
      // The header allows exactly one framer: the site's own origin.
      return sameOrigin
        ? {
            embeddable: true,
            reason: "allowed",
            detail: xfo,
            sameOrigin,
            via: "same_origin",
          }
        : {
            embeddable: false,
            reason: "x_frame_options",
            detail: xfo,
            sameOrigin,
            via: "denied",
          };
    }
    if (value.startsWith("allow-from")) {
      const allowed = originOf(xfo.slice("allow-from".length));
      const ok = Boolean(allowed && embedder && allowed === embedder);
      return {
        embeddable: ok,
        reason: ok ? "allowed" : "x_frame_options",
        detail: xfo,
        sameOrigin,
        via: ok ? "listed" : "denied",
      };
    }
  }

  const ancestors = frameAncestors(headers.contentSecurityPolicy);
  if (ancestors) {
    const tokens = ancestors
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const lowered = tokens.map((token) => token.toLowerCase());

    if (lowered.includes("'none'")) {
      return {
        embeddable: false,
        reason: "frame_ancestors",
        detail: ancestors,
        sameOrigin,
        via: "denied",
      };
    }
    if (tokens.includes("*")) {
      return {
        embeddable: true,
        reason: "allowed",
        detail: ancestors,
        sameOrigin,
        via: "wildcard",
      };
    }
    if (lowered.includes("'self'") && sameOrigin) {
      return {
        embeddable: true,
        reason: "allowed",
        detail: ancestors,
        sameOrigin,
        via: "same_origin",
      };
    }

    const listedOrigins = tokens
      .filter(
        (token) => token.startsWith("http://") || token.startsWith("https://")
      )
      .map((token) => originOf(token));
    if (embedder && listedOrigins.includes(embedder)) {
      return {
        embeddable: true,
        reason: "allowed",
        detail: ancestors,
        sameOrigin,
        via: "listed",
      };
    }

    return {
      embeddable: false,
      reason: "frame_ancestors",
      detail: ancestors,
      sameOrigin,
      via: "denied",
    };
  }

  return {
    embeddable: true,
    reason: "allowed",
    detail: xfo ?? ancestors ?? null,
    sameOrigin,
    via: xfo ? "listed" : "none",
  };
}
