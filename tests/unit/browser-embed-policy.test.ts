import { describe, expect, it } from "vitest";

import { embedVerdict, frameAncestors } from "@/lib/browser/embed-policy";

describe("frame embedding decision", () => {
  it("allows a site that sends no framing headers", () => {
    expect(embedVerdict({}).embeddable).toBe(true);
  });

  it("refuses X-Frame-Options DENY and SAMEORIGIN", () => {
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
