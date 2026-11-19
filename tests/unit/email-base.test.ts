import { describe, expect, it } from "vitest";

import { CANONICAL_APP_ORIGIN, resolveEmailBase } from "@/lib/email/base";

describe("mail links land on a domain a recipient can actually open", () => {
  it("defaults to the canonical production origin", () => {
    expect(resolveEmailBase({})).toBe(CANONICAL_APP_ORIGIN);
  });

  it("never points a mail at an ephemeral vercel deployment", () => {
    expect(
      resolveEmailBase({
        NEXT_PUBLIC_APP_URL:
          "https://chatbot-clean-git-feat-growth-oauth-and-runtim-95f5c2-zooka-ai1.vercel.app",
      })
    ).toBe(CANONICAL_APP_ORIGIN);
  });

  it("keeps a real custom domain that was configured on purpose", () => {
    expect(
      resolveEmailBase({ NEXT_PUBLIC_APP_URL: "https://staging.zooka-ai.com/" })
    ).toBe("https://staging.zooka-ai.com");
  });

  it("lets an isolated run opt in explicitly, above everything else", () => {
    expect(
      resolveEmailBase({
        EMAIL_PUBLIC_BASE_URL: "https://acceptance.example.com/",
        NEXT_PUBLIC_APP_URL: "https://zooka-ai.com",
      })
    ).toBe("https://acceptance.example.com");
  });

  it("survives a malformed value instead of dropping the mail", () => {
    expect(resolveEmailBase({ NEXT_PUBLIC_APP_URL: "not-a-url" })).toBe(
      CANONICAL_APP_ORIGIN
    );
    expect(
      resolveEmailBase({ EMAIL_PUBLIC_BASE_URL: "  ", NEXT_PUBLIC_APP_URL: "//x" })
    ).toBe(CANONICAL_APP_ORIGIN);
  });
});
