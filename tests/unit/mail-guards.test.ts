import { beforeEach, describe, expect, it } from "vitest";

import { buildMailAudit, MAIL_AUDIT_ACTIONS } from "@/lib/mail/audit";
import { checkMailLimit, MAIL_LIMITS, resetMailLimit } from "@/lib/mail/rate-limit";

describe("rate limits", () => {
  beforeEach(() => {
    resetMailLimit("availability", "user-x");
  });

  it("allows the documented number of availability checks, then refuses", () => {
    const limit = MAIL_LIMITS.availability.limit;
    for (let index = 0; index < limit; index += 1) {
      expect(checkMailLimit("availability", "user-x").allowed).toBe(true);
    }
    const refused = checkMailLimit("availability", "user-x");
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) expect(refused.retryAfterMs).toBeGreaterThan(0);
  });

  it("keeps buckets separate per user and per kind", () => {
    const limit = MAIL_LIMITS.availability.limit;
    for (let index = 0; index < limit; index += 1) checkMailLimit("availability", "user-x");
    expect(checkMailLimit("availability", "user-x").allowed).toBe(false);
    expect(checkMailLimit("availability", "user-y").allowed).toBe(true);
    expect(checkMailLimit("reserve", "user-x").allowed).toBe(true);
  });

  it("gives sending a much tighter ceiling than reading", () => {
    expect(MAIL_LIMITS.send.limit).toBeLessThan(MAIL_LIMITS.ai.limit);
    expect(MAIL_LIMITS.send.windowMs).toBeGreaterThan(MAIL_LIMITS.ai.windowMs);
  });
});

describe("audit rows", () => {
  it("records the action and drops everything that is not on the allowlist", () => {
    const record = buildMailAudit({
      organizationId: "org-a",
      userId: "user-1",
      action: "mailbox.reserved",
      targetId: "addr-1",
      metadata: {
        localPart: "helmy",
        provider: "hosted",
        body: "the whole message body",
        subject: "invoice 42",
        html: "<p>x</p>",
        token: "secret-token",
        to: "someone@example.com",
      },
    });
    expect(record.action).toBe("mailbox.reserved");
    expect(record.metadata).toEqual({ localPart: "helmy", provider: "hosted" });
    expect(JSON.stringify(record)).not.toContain("invoice 42");
    expect(JSON.stringify(record)).not.toContain("secret-token");
  });

  it("masks an address that reaches an allowed key", () => {
    const record = buildMailAudit({
      organizationId: "org-a",
      userId: null,
      action: "message.read",
      metadata: { detail: "sender helmy@zooka-ai.com", senderDomain: "example.com" },
    });
    expect(record.metadata.detail).toBe("sender h***@zooka-ai.com");
    expect(record.metadata.senderDomain).toBe("example.com");
  });

  it("only ever emits actions from the declared set", () => {
    expect(MAIL_AUDIT_ACTIONS).toContain("draft.send_blocked");
    const record = buildMailAudit({
      organizationId: "org-a",
      userId: "user-1",
      action: "draft.send_blocked",
      metadata: { reason: "provider_not_activated" },
    });
    expect(record.metadata.reason).toBe("provider_not_activated");
  });
});
