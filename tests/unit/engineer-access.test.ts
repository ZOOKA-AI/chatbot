import { describe, expect, it } from "vitest";

import {
  createOrRotateReadOnlyRole,
  deployKeyBody,
  revokeReadOnlyRole,
  validateReadOnlyPassword,
  validateReadOnlyRoleName,
  vercelTokenBody,
} from "@/lib/admin/engineer-access";

describe("engineer access rules", () => {
  it("accepts a normal engineer role name and refuses reserved or malformed ones", () => {
    expect(validateReadOnlyRoleName("engineer_ro")).toBe(true);
    expect(validateReadOnlyRoleName("engineer2")).toBe(true);
    for (const bad of [
      "postgres",
      "anon",
      "authenticated",
      "pg_read_all_data",
      "Engineer",
      "a",
      "e ngineer",
      "e;drop",
    ]) {
      expect(validateReadOnlyRoleName(bad)).toBe(false);
    }
  });

  it("only accepts generated passwords that cannot escape a quoted literal", () => {
    expect(validateReadOnlyPassword("a".repeat(24))).toBe(true);
    expect(validateReadOnlyPassword("A1".repeat(20))).toBe(true);
    for (const bad of [
      "short",
      "x".repeat(23),
      `ab';drop role x;--aaaaaaaaaaaaaaa`,
      `ab"cd${"x".repeat(30)}`,
      `ab\\cd${"x".repeat(30)}`,
    ]) {
      expect(validateReadOnlyPassword(bad)).toBe(false);
    }
  });

  it("grants read only and explicitly revokes every write privilege", () => {
    const statements = createOrRotateReadOnlyRole(
      "engineer_ro",
      "A1".repeat(12),
      false
    );
    expect(statements[0]).toContain("create role engineer_ro");
    expect(statements[0]).toContain("bypassrls");
    expect(
      statements.some((s) => s.startsWith("grant select on all tables"))
    ).toBe(true);
    expect(statements).toContain(
      "revoke insert, update, delete, truncate on all tables in schema public from engineer_ro"
    );
    expect(statements.join(" ")).not.toMatch(
      /grant (all|insert|update|delete)/
    );
  });

  it("rotates instead of creating when the role already exists", () => {
    const statements = createOrRotateReadOnlyRole(
      "engineer_ro",
      "A1".repeat(12),
      true
    );
    expect(statements[0]).toBe(
      "alter role engineer_ro with login password 'A1A1A1A1A1A1A1A1A1A1A1A1'"
    );
    expect(statements.join(" ")).not.toContain("create role");
  });

  it("refuses to build statements for an unvalidated name", () => {
    expect(() =>
      createOrRotateReadOnlyRole("bad name", "A1".repeat(12), false)
    ).toThrow();
    expect(() => revokeReadOnlyRole("postgres")).toThrow();
    expect(revokeReadOnlyRole("engineer_ro").at(-1)).toBe(
      "drop role if exists engineer_ro"
    );
  });

  it("builds a future-dated Vercel token and refuses a past expiry", () => {
    const expiresAt = Date.now() + 86_400_000;
    expect(vercelTokenBody("engineer-zooka-ai", expiresAt)).toEqual({
      name: "engineer-zooka-ai",
      expiresAt: Math.floor(expiresAt),
    });
    expect(() => vercelTokenBody("engineer", Date.now() - 1)).toThrow();
    expect(() => vercelTokenBody("  ", expiresAt)).toThrow();
  });

  it("accepts one SSH key line and refuses anything else", () => {
    const key = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${"a".repeat(30)} engineer@zooka-ai.com`;
    expect(
      deployKeyBody({ title: "engineer", publicKey: key, readOnly: false })
    ).toMatchObject({ read_only: false });
    expect(() =>
      deployKeyBody({
        title: "engineer",
        publicKey: "not-a-key",
        readOnly: true,
      })
    ).toThrow();
    expect(() =>
      deployKeyBody({ title: " ", publicKey: key, readOnly: true })
    ).toThrow();
  });
});
