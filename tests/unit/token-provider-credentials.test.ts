import { describe, expect, it } from "vitest";
import { TOKEN_PROVIDERS } from "@/lib/integrations/token-providers";

/**
 * The credential shapes these providers actually require. A connect form that
 * sends the wrong header rejects every valid key, which reads to the user as
 * "my key is broken".
 */
describe("token provider credentials", () => {
  it("sends the ImprovMX key as a Basic password with an empty username", () => {
    const header = TOKEN_PROVIDERS.improvmx.auth("sk_live_key").Authorization;
    expect(header).toBe(`Basic ${Buffer.from(":sk_live_key").toString("base64")}`);
  });

  it("names the Stripe account from its own dashboard label", () => {
    const described = TOKEN_PROVIDERS.stripe.describe({
      id: "acct_123",
      settings: { dashboard: { display_name: "Zooka Billing" } },
      country: "AE",
    });
    expect(described.accountId).toBe("acct_123");
    expect(described.accountName).toBe("Zooka Billing");
    expect(described.extra.country).toBe("AE");
  });

  it("refuses to describe a Stripe response with no account id", () => {
    expect(() => TOKEN_PROVIDERS.stripe.describe({ error: { message: "bad key" } })).toThrow();
  });

  it("counts Supabase projects from the bare array the API returns", () => {
    const described = TOKEN_PROVIDERS.supabase.describe([
      { id: "ref1", region: "eu-central-1" },
      { id: "ref2", region: "us-east-1" },
    ] as never);
    expect(described.accountName).toBe("Supabase (2 projects)");
    expect(described.extra.projects).toBe(2);
  });

  it("says so honestly when a Supabase token sees no projects", () => {
    const described = TOKEN_PROVIDERS.supabase.describe([] as never);
    expect(described.accountName).toBe("Supabase (no projects)");
    expect(described.accountId).toBeNull();
  });
});
