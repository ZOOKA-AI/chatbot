import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as unknown,
  caller: null as null | { user: { id: string; organizationId: string }; organizationId: string; role: string },
}));

vi.mock("@/lib/db/queries", () => ({
  get db() { return state.db; },
}));
vi.mock("@/lib/agents/auth", () => ({
  json: (body: unknown, status = 200) => Response.json(body, { status }),
  unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: async () => state.caller }));
vi.mock("@/lib/db/request-tenant", () => ({ withRequestTenantHandler: (handler: unknown) => handler }));

import * as store from "@/lib/db/skills";
import * as collection from "@/app/api/workspace/skills/route";
import * as item from "@/app/api/workspace/skills/[name]/route";

const migration = readFileSync("lib/db/migrations/0028_workspace_skills.sql", "utf8");
const grants = readFileSync("lib/db/migrations/pending/0068_workspace_skills_grants.sql", "utf8");
let pg: PGlite;

function request(method: string, body?: unknown) {
  return new Request("http://localhost/api/workspace/skills", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}
const context = (name: string) => ({ params: Promise.resolve({ name }) });
const ORG_A = "10000000-0000-4000-8000-000000000001";
const ORG_B = "10000000-0000-4000-8000-000000000002";
const USER = "20000000-0000-4000-8000-000000000001";
const owner = (organizationId: string, role = "owner") => ({ user: { id: USER, organizationId }, organizationId, role });
const valid = { name: "research", description: "Research", instructions: "Find sources." };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE ROLE zooka_runtime`);
  await pg.exec(`CREATE TABLE "Organization" (id uuid PRIMARY KEY); CREATE TABLE "User" (id uuid PRIMARY KEY);
    INSERT INTO "Organization" VALUES ('${ORG_A}'), ('${ORG_B}'); INSERT INTO "User" VALUES ('${USER}')`);
  await pg.exec(migration);
  state.db = drizzle(pg);
});
beforeEach(async () => {
  await pg.exec(`RESET ROLE; DELETE FROM "WorkspaceSkill"`);
  state.caller = owner(ORG_A);
});
afterAll(async () => { await pg.close(); });

describe("workspace skills", () => {
  test("store scopes every operation, with unique names per workspace", async () => {
    expect(await store.createWorkspaceSkill({ organizationId: ORG_A, createdBy: USER, ...valid })).not.toBeNull();
    expect(await store.createWorkspaceSkill({ organizationId: ORG_A, createdBy: USER, ...valid })).toBeNull();
    expect(await store.createWorkspaceSkill({ organizationId: ORG_B, createdBy: USER, ...valid })).not.toBeNull();
    expect(await store.createWorkspaceSkill({ organizationId: ORG_A, createdBy: USER, ...valid, name: "private" })).not.toBeNull();
    expect((await store.listWorkspaceSkills(ORG_B)).map((s) => s.name)).toEqual(["research"]);
    expect(await store.getWorkspaceSkillByName(ORG_B, "private")).toBeNull();
    expect(await store.updateWorkspaceSkill(ORG_B, "private", { enabled: false })).toBeNull();
    expect(await store.deleteWorkspaceSkill(ORG_B, "private")).toBe(false);
    expect((await store.getWorkspaceSkillByName(ORG_A, "private"))?.enabled).toBe(true);
  });

  test("runtime role is granted DML but RLS blocks cross-workspace access", async () => {
    await store.createWorkspaceSkill({ organizationId: ORG_A, createdBy: USER, ...valid });
    await store.createWorkspaceSkill({ organizationId: ORG_B, createdBy: USER, ...valid, name: "other" });
    await pg.exec(`REVOKE ALL ON "WorkspaceSkill" FROM zooka_runtime`);
    await pg.exec(grants);
    await pg.exec(`SET ROLE zooka_runtime; SELECT set_config('app.organization_id', '${ORG_A}', false)`);
    expect((await store.listWorkspaceSkills(ORG_A)).map((s) => s.name)).toEqual(["research"]);
    expect(await store.listWorkspaceSkills(ORG_B)).toEqual([]);
    expect(await store.updateWorkspaceSkill(ORG_B, "other", { enabled: false })).toBeNull();
    await expect(store.createWorkspaceSkill({ organizationId: ORG_B, createdBy: USER, ...valid, name: "blocked" })).rejects.toThrow();
    expect(await store.createWorkspaceSkill({ organizationId: ORG_A, createdBy: USER, ...valid, name: "allowed" })).not.toBeNull();
  });

  test("membership policy works when 0062 runs before or after the Drizzle migration", async () => {
    for (const helperFirst of [true, false]) {
      const instance = new PGlite();
      try {
        await instance.exec(`CREATE ROLE zooka_runtime;
          CREATE TABLE "Organization" (id uuid PRIMARY KEY);
          CREATE TABLE "User" (id uuid PRIMARY KEY);
          CREATE TABLE "OrganizationMember" ("organizationId" uuid, "userId" uuid);
          INSERT INTO "Organization" VALUES ('${ORG_A}'), ('${ORG_B}');
          INSERT INTO "User" VALUES ('${USER}');
          INSERT INTO "OrganizationMember" VALUES ('${ORG_A}', '${USER}')`);
        const membership = readFileSync("lib/db/migrations/pending/0062_policy_subject_membership.sql", "utf8");
        if (helperFirst) await instance.exec(membership);
        await instance.exec(migration);
        if (!helperFirst) await instance.exec(membership);
        await instance.exec(migration);
        await instance.exec(`INSERT INTO "WorkspaceSkill" ("organizationId", "name", "description", "instructions")
          VALUES ('${ORG_A}', 'a', 'a', 'a'), ('${ORG_B}', 'b', 'b', 'b');
          SET ROLE zooka_runtime;
          SELECT set_config('request.jwt.claims', '{"sub":"${USER}"}', false);
          SELECT set_config('app.organization_id', '${ORG_B}', false)`);
        expect((await instance.query(`SELECT * FROM "WorkspaceSkill"`)).rows).toHaveLength(0);
        await instance.exec(`SELECT set_config('app.organization_id', '${ORG_A}', false)`);
        expect((await instance.query(`SELECT * FROM "WorkspaceSkill"`)).rows).toHaveLength(1);
      } finally {
        await instance.close();
      }
    }
  });

  test("routes enforce authorization, strict validation, and isolation", async () => {
    state.caller = null;
    expect((await collection.GET(request("GET"))).status).toBe(401);
    state.caller = owner(ORG_A, "member");
    expect((await collection.POST(request("POST", valid))).status).toBe(403);
    state.caller = owner(ORG_A);
    for (const body of [
      { ...valid, name: "../bad" }, { ...valid, name: "Upper" }, { ...valid, name: "bad--slug" }, { ...valid, name: "bad_" },
      { ...valid, description: " " }, { ...valid, instructions: "x".repeat(16001) },
      { ...valid, organizationId: ORG_B }, { ...valid, enabled: "true" },
    ]) expect((await collection.POST(request("POST", body))).status).toBe(400);
    expect((await collection.POST(request("POST", valid))).status).toBe(201);
    expect((await collection.POST(request("POST", valid))).status).toBe(409);
    expect((await collection.POST(request("POST", { ...valid, name: "other" }))).status).toBe(201);
    expect((await item.PATCH(request("PATCH", { name: "other" }), context("research"))).status).toBe(409);
    expect((await item.PATCH(request("PATCH", { name: "renamed" }), context("other"))).status).toBe(200);
    expect((await item.GET(request("GET"), context("renamed"))).status).toBe(200);
    expect((await item.PATCH(request("PATCH", {}), context("research"))).status).toBe(400);
    expect((await item.PATCH(request("PATCH", { enabled: false }), context("research"))).status).toBe(200);
    expect((await item.GET(request("GET"), context("../bad"))).status).toBe(400);
    state.caller = owner(ORG_A, "member");
    expect((await collection.GET(request("GET"))).status).toBe(200);
    expect((await item.GET(request("GET"), context("research"))).status).toBe(200);
    expect((await item.PATCH(request("PATCH", { enabled: true }), context("research"))).status).toBe(403);
    expect((await item.DELETE(request("DELETE"), context("research"))).status).toBe(403);
    state.caller = owner(ORG_B, "member");
    expect(await (await collection.GET(request("GET"))).json()).toEqual({ skills: [], count: 0 });
    expect((await item.GET(request("GET"), context("research"))).status).toBe(404);
    expect((await item.PATCH(request("PATCH", { enabled: true }), context("research"))).status).toBe(403);
    expect((await item.DELETE(request("DELETE"), context("research"))).status).toBe(403);
    state.caller = owner(ORG_B);
    expect(await (await collection.GET(request("GET"))).json()).toEqual({ skills: [], count: 0 });
    expect((await item.GET(request("GET"), context("research"))).status).toBe(404);
    expect((await item.PATCH(request("PATCH", { enabled: true }), context("research"))).status).toBe(404);
    expect((await item.DELETE(request("DELETE"), context("research"))).status).toBe(404);
    state.caller = owner(ORG_A);
    expect((await item.DELETE(request("DELETE"), context("research"))).status).toBe(200);
  });
});
