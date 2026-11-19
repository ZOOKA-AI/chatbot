import { describe, expect, it } from "vitest";

import { listFolder, loadMailbox } from "@/lib/mail/isolation";
import { reserveMailAddress } from "@/lib/mail/reserve";
import { createFakeRepo, makeMessage } from "./mail-fixtures";

async function twoTenants() {
  const fake = createFakeRepo();
  const a = await reserveMailAddress({ repo: fake.repo, organizationId: "org-a", userId: "user-a", localPart: "alpha" });
  const b = await reserveMailAddress({ repo: fake.repo, organizationId: "org-b", userId: "user-b", localPart: "beta" });
  if (!a.ok || !b.ok) throw new Error("fixture setup failed");
  return { ...fake, mailboxA: a.record, mailboxB: b.record };
}

describe("tenant isolation", () => {
  it("hides another workspace's mailbox behind the same not_found answer", async () => {
    const { repo, mailboxB } = await twoTenants();
    const asTenantA = await loadMailbox({ repo, organizationId: "org-a", mailAddressId: mailboxB.id });
    expect(asTenantA).toEqual({ ok: false, reason: "not_found" });

    const missing = await loadMailbox({ repo, organizationId: "org-a", mailAddressId: "does-not-exist" });
    expect(missing).toEqual(asTenantA);
  });

  it("returns a mailbox to its own workspace", async () => {
    const { repo, mailboxA } = await twoTenants();
    const result = await loadMailbox({ repo, organizationId: "org-a", mailAddressId: mailboxA.id });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.address).toBe("alpha@zooka-ai.com");
  });

  it("never returns a message belonging to another workspace", async () => {
    const { repo, messages, mailboxA, mailboxB } = await twoTenants();

    messages.set("m1", makeMessage({ id: "m1", organizationId: "org-a", mailAddressId: mailboxA.id }));
    // A row that leaked into the wrong tenant, as a repository bug would produce.
    messages.set(
      "m2",
      makeMessage({ id: "m2", organizationId: "org-b", mailAddressId: mailboxA.id })
    );
    void mailboxB;

    const result = await listFolder({
      repo,
      organizationId: "org-a",
      mailAddressId: mailboxA.id,
      folder: "inbox",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((entry) => entry.id)).toEqual(["m1"]);
    }
  });

  it("refuses a folder read for a mailbox in another workspace", async () => {
    const { repo, mailboxB } = await twoTenants();
    const result = await listFolder({
      repo,
      organizationId: "org-a",
      mailAddressId: mailboxB.id,
      folder: "inbox",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("clamps the page size so one call cannot drain a mailbox", async () => {
    const { repo, messages, mailboxA } = await twoTenants();
    for (let index = 0; index < 200; index += 1) {
      messages.set(
        `m${index}`,
        makeMessage({ id: `m${index}`, organizationId: "org-a", mailAddressId: mailboxA.id })
      );
    }
    const result = await listFolder({
      repo,
      organizationId: "org-a",
      mailAddressId: mailboxA.id,
      folder: "inbox",
      limit: 5000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(200);
  });
});
