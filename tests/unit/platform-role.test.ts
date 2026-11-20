import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isUserId, platformRoleSatisfies } from "@/lib/auth/platform-role-policy";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id?: string; email?: string; organizationRole?: string; platformRole?: string } },
  roleRows: [] as Array<{ role: string }>,
  lookupThrows: false,
  audits: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/app/(auth)/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/db/queries", () => ({
  adminDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (state.lookupThrows) throw new Error('relation "PlatformRole" does not exist');
            return state.roleRows;
          },
        }),
      }),
    }),
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        state.audits.push(row);
      },
    }),
  }),
}));

import { requirePlatformRole } from "@/lib/auth/platform-role";

const ID = "6f1c2a7e-3b4d-4c5e-8f90-123456789abc";

beforeEach(() => {
  state.session = null;
  state.roleRows = [];
  state.lookupThrows = false;
  state.audits = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("platform role policy", () => {
  it("ranks super_admin above admin and rejects anything else", () => {
    expect(platformRoleSatisfies("super_admin", "admin")).toBe(true);
    expect(platformRoleSatisfies("super_admin", "super_admin")).toBe(true);
    expect(platformRoleSatisfies("admin", "admin")).toBe(true);
    expect(platformRoleSatisfies("admin", "super_admin")).toBe(false);
    for (const held of ["owner", "member", "SUPER_ADMIN", "", null, undefined, 2, {}]) {
      expect(platformRoleSatisfies(held, "admin")).toBe(false);
    }
  });

  it("accepts only uuid user ids", () => {
    expect(isUserId(ID)).toBe(true);
    expect(isUserId("zookaalmrzwq@gmail.com")).toBe(false);
    expect(isUserId("' or 1=1 --")).toBe(false);
  });
});

describe("requirePlatformRole", () => {
  it("denies an unauthenticated visitor without touching the database", async () => {
    expect(await requirePlatformRole("admin", "t")).toBeNull();
    expect(state.audits).toHaveLength(0);
  });

  it("denies a workspace owner with no platform grant, and audits the denial", async () => {
    state.session = { user: { id: ID, organizationRole: "owner" } };
    expect(await requirePlatformRole("admin", "admin.page")).toBeNull();
    expect(state.audits[0]).toMatchObject({ action: "admin.page", outcome: "denied", actorUserId: ID });
  });

  it("ignores a forged platform role claim in the session", async () => {
    state.session = { user: { id: ID, platformRole: "super_admin" } };
    expect(await requirePlatformRole("admin", "t")).toBeNull();
  });

  it("allows an admin grant for admin, and refuses it for super_admin", async () => {
    state.session = { user: { id: ID } };
    state.roleRows = [{ role: "admin" }];
    expect(await requirePlatformRole("admin", "t")).toMatchObject({ userId: ID, role: "admin" });
    expect(await requirePlatformRole("super_admin", "t")).toBeNull();
  });

  it("allows super_admin everywhere and audits when asked", async () => {
    state.session = { user: { id: ID } };
    state.roleRows = [{ role: "super_admin" }];
    expect(await requirePlatformRole("super_admin", "x", { auditAllowed: true })).toMatchObject({
      role: "super_admin",
    });
    expect(state.audits[0]).toMatchObject({ action: "x", outcome: "allowed" });
  });

  it("fails closed when the role table is missing or unreadable", async () => {
    state.session = { user: { id: ID } };
    state.lookupThrows = true;
    expect(await requirePlatformRole("admin", "t")).toBeNull();
  });

  it("treats an unknown stored role as no role", async () => {
    state.session = { user: { id: ID } };
    state.roleRows = [{ role: "owner" }];
    expect(await requirePlatformRole("admin", "t")).toBeNull();
  });
});

describe("every admin entry point uses the platform gate", () => {
  const files = [
    "app/(chat)/admin/layout.tsx",
    "lib/admin/page-guard.tsx",
    "app/api/admin/overview/route.ts",
    "app/api/admin/users/route.ts",
    "app/admin/referrals/page.tsx",
    "app/admin/referrals/actions.ts",
  ];
  for (const file of files) {
    it(`${file} calls requirePlatformRole`, () => {
      expect(readFileSync(file, "utf8")).toContain("requirePlatformRole(");
    });
  }

  it("no admin gate decides access from a workspace role or an email list", () => {
    const layout = readFileSync("app/(chat)/admin/layout.tsx", "utf8");
    expect(layout).not.toMatch(/context\.role === "(owner|admin)"/);
    const referrals = readFileSync("app/admin/referrals/page.tsx", "utf8");
    expect(referrals).not.toContain("ADMIN_EMAILS");
    expect(referrals).not.toContain("BACKUP_TOKEN");
    expect(referrals).not.toMatch(/@gmail\.com/);
  });
});
