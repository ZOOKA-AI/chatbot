import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { adminEmailList, referralsAccess } from "@/lib/admin/referrals-access";

const PAGE = "app/admin/referrals/page.tsx";

describe("who may read the referral report", () => {
  test("a request with no session and no key is refused", () => {
    const access = referralsAccess({ backupToken: "secret-key" });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "no_session");
  });

  test("a signed-in user who is not an administrator is refused", () => {
    const access = referralsAccess({
      sessionEmail: "customer@example.com",
      adminEmailsEnv: "owner@zooka-ai.com",
      backupToken: "secret-key",
    });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "not_admin");
  });

  test("an administrator session is allowed, matched case-insensitively", () => {
    const access = referralsAccess({
      sessionEmail: "  Owner@Zooka-AI.com ",
      adminEmailsEnv: "owner@zooka-ai.com, second@zooka-ai.com",
      backupToken: "secret-key",
    });
    assert.equal(access.allowed, true);
    assert.equal(access.reason, "admin_session");
  });

  test("the backup key opens the report without a session", () => {
    const access = referralsAccess({ key: "secret-key", backupToken: "secret-key" });
    assert.equal(access.allowed, true);
    assert.equal(access.reason, "backup_key");
  });

  test("a wrong key with no session is refused, and an empty key never matches", () => {
    assert.equal(
      referralsAccess({ key: "wrong", backupToken: "secret-key" }).allowed,
      false
    );
    assert.equal(referralsAccess({ key: "", backupToken: "" }).allowed, false);
    assert.equal(referralsAccess({ key: "anything", backupToken: "" }).allowed, false);
  });

  test("the built-in administrator list applies when the environment is empty", () => {
    const admins = adminEmailList("");
    assert.ok(admins.includes("zookaalmrzwq@gmail.com"));
    assert.equal(
      referralsAccess({ sessionEmail: "zookaalmrzwq@gmail.com", adminEmailsEnv: "" }).allowed,
      true
    );
    assert.equal(
      referralsAccess({ sessionEmail: "intruder@example.com", adminEmailsEnv: "" }).allowed,
      false
    );
  });

  test("the page routes its decision through this gate instead of an inline check", () => {
    const source = readFileSync(PAGE, "utf8");
    assert.match(source, /referralsAccess\(/);
    assert.doesNotMatch(source, /params\.k\s*===\s*process\.env\.BACKUP_TOKEN/);
    assert.doesNotMatch(source, /adminEmails\.includes\(/);
  });
});
