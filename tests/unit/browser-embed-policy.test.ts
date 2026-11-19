import { describe, expect, it } from "vitest";

import { embedVerdict, frameAncestors } from "@/lib/browser/embed-policy";

describe("frame embedding decision", () => {
  it("allows a site that sends no framing headers", () => {
    expect(embedVerdict({}).embeddable).toBe(true);
  });

  it("refuses X-Frame-Options DENY and SAMEORIGIN when the framer is unknown", () => {
    expect(embedVerdict({ xFrameOptions: "DENY" }).reason).toBe(
      "x_frame_options",
    );
    expect(embedVerdict({ xFrameOptions: "SAMEORIGIN" }).reason).toBe(
      "x_frame_options",
    );
  });

  it("reads frame-ancestors out of a longer policy", () => {
    const csp = "default-src 'self'; frame-ancestors 'none'; img-src *";
    expect(frameAncestors(csp)).toBe("'none'");
    expect(embedVerdict({ contentSecurityPolicy: csp })).toMatchObject({
      embeddable: false,
      reason: "frame_ancestors",
    });
  });

  it("allows an explicit wildcard", () => {
    expect(
      embedVerdict({ contentSecurityPolicy: "frame-ancestors *" }).embeddable,
    ).toBe(true);
  });
});

describe("SAMEORIGIN is a permission for the site's own origin", () => {
  const context = {
    embedderOrigin: "https://zooka-ai.com",
    targetUrl: "https://zooka-ai.com/workspace",
  };

  it("allows zooka-ai.com to frame zooka-ai.com", () => {
    expect(embedVerdict({ xFrameOptions: "SAMEORIGIN" }, context)).toMatchObject({
      embeddable: true,
      reason: "allowed",
      sameOrigin: true,
      via: "same_origin",
    });
  });

  it("still refuses a preview host framing the production page", () => {
    expect(
      embedVerdict(
        { xFrameOptions: "SAMEORIGIN" },
        {
          embedderOrigin: "https://chatbot-preview.vercel.app",
          targetUrl: "https://zooka-ai.com/workspace",
        },
      ),
    ).toMatchObject({ embeddable: false, reason: "x_frame_options" });
  });

  it("refuses DENY even on the same origin", () => {
    expect(embedVerdict({ xFrameOptions: "DENY" }, context)).toMatchObject({
      embeddable: false,
      sameOrigin: true,
    });
  });

  it("treats a differing port or scheme as a different origin", () => {
    expect(
      embedVerdict(
        { xFrameOptions: "SAMEORIGIN" },
        {
          embedderOrigin: "http://zooka-ai.com",
          targetUrl: "https://zooka-ai.com/",
        },
      ).embeddable,
    ).toBe(false);
  });
});

describe("frame-ancestors with a real origin", () => {
  const embedderOrigin = "https://zooka-ai.com";

  it("honours 'self' only on the same origin", () => {
    expect(
      embedVerdict(
        { contentSecurityPolicy: "frame-ancestors 'self'" },
        { embedderOrigin, targetUrl: "https://zooka-ai.com/pricing" },
      ).embeddable,
    ).toBe(true);
    expect(
      embedVerdict(
        { contentSecurityPolicy: "frame-ancestors 'self'" },
        { embedderOrigin, targetUrl: "https://example.com/" },
      ).embeddable,
    ).toBe(false);
  });

  it("allows an origin that is named in the list", () => {
    expect(
      embedVerdict(
        {
          contentSecurityPolicy:
            "frame-ancestors 'self' https://zooka-ai.com https://app.example.com",
        },
        { embedderOrigin, targetUrl: "https://example.com/" },
      ),
    ).toMatchObject({ embeddable: true, via: "listed" });
  });

  it("refuses a list that does not name the framer", () => {
    expect(
      embedVerdict(
        { contentSecurityPolicy: "frame-ancestors https://other.example.com" },
        { embedderOrigin, targetUrl: "https://example.com/" },
      ),
    ).toMatchObject({ embeddable: false, reason: "frame_ancestors" });
  });

  it("honours X-Frame-Options ALLOW-FROM for the named origin", () => {
    expect(
      embedVerdict(
        { xFrameOptions: "ALLOW-FROM https://zooka-ai.com" },
        { embedderOrigin, targetUrl: "https://example.com/" },
      ).embeddable,
    ).toBe(true);
  });
});
