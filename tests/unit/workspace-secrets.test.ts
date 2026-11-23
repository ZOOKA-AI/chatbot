import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as unknown,
  caller: null as null | { user: { id: string; organizationId: string }; organizationId: string; role: string },
}));
vi.mock("@/lib/db/queries", () => ({ get db() { return state.db; } }));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: async () => state.caller }));
vi.mock("@/lib/db/request-tenant", () => ({ withRequestTenantHandler: (handler: unknown) => handler }));

import * as store from "@/lib/db/workspace-secrets";
import { decryptWorkspaceSecret, encryptWorkspaceSecret } from "@/lib/workspace/secrets/crypto";
import * as collection from "@/app/api/workspace/secrets/route";
import * as item from "@/app/api/workspace/secrets/[name]/route";
import * as settings from "@/app/api/workspace/secrets/settings/route";
import { githubRepoProbe } from "@/lib/agents/worker-tools/github-inspect";

const migration = readFileSync("lib/db/migrations/0029_workspace_secrets.sql", "utf8");
const membership = readFileSync("lib/db/migrations/pending/0062_policy_subject_membership.sql", "utf8");
const grants = readFileSync("lib/db/migrations/pending/0069_workspace_secrets_grants.sql", "utf8");
const ORG_A = "10000000-0000-4000-8000-000000000001";
const ORG_B = "10000000-0000-4000-8000-000000000002";
const USER = "20000000-0000-4000-8000-000000000001";
const value = ["private", "sample", "value"].join("-");
const owner = (organizationId: string, role = "owner") => ({ user: { id: USER, organizationId }, organizationId, role });
const context = (name: string) => ({ params: Promise.resolve({ name }) });
const request = (method: string, body?: unknown) => new Request("http://localhost/api/workspace/secrets", {
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
});
let pg: PGlite;
let oldKey: string | undefined;

beforeAll(async () => {
  oldKey = process.env.WORKSPACE_SECRETS_ENCRYPTION_KEY;
  process.env.WORKSPACE_SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  pg = new PGlite();
  await pg.exec(`CREATE ROLE zooka_runtime;
    CREATE TABLE "Organization" (id uuid PRIMARY KEY);
    CREATE TABLE "User" (id uuid PRIMARY KEY);
    INSERT INTO "Organization" VALUES ('${ORG_A}'), ('${ORG_B}');
    INSERT INTO "User" VALUES ('${USER}')`);
  await pg.exec(migration);
  state.db = drizzle(pg);
});
beforeEach(async () => {
  await pg.exec(`RESET ROLE; DELETE FROM "WorkspaceSecret"; DELETE FROM "WorkspaceSecretSettings"`);
  state.caller = owner(ORG_A);
});
afterAll(async () => {
  if (oldKey === undefined) delete process.env.WORKSPACE_SECRETS_ENCRYPTION_KEY;
  else process.env.WORKSPACE_SECRETS_ENCRYPTION_KEY = oldKey;
  await pg.close();
});

describe("workspace secrets", () => {
  test("chat disables detection only when the settings table is missing", async () => {
    const instance = new PGlite();
    try {
      state.db = drizzle(instance);
      await instance.exec("BEGIN");
      expect(await store.getChatSecretDetectionEnabled(ORG_A)).toBe(false);
      await instance.exec('CREATE TABLE "WorkspaceSecretSettings" ("organizationId" uuid PRIMARY KEY, "detectionEnabled" boolean NOT NULL)');
      expect(await store.getChatSecretDetectionEnabled(ORG_A)).toBe(true);
      await instance.exec(`INSERT INTO "WorkspaceSecretSettings" VALUES ('${ORG_A}', false)`);
      expect(await store.getChatSecretDetectionEnabled(ORG_A)).toBe(false);
      await instance.exec("COMMIT");

      await instance.exec('ALTER TABLE "WorkspaceSecretSettings" DROP COLUMN "detectionEnabled"');
      await expect(store.getChatSecretDetectionEnabled(ORG_A)).rejects.toThrow();
    } finally {
      state.db = drizzle(pg);
      await instance.close();
    }
  });

  test("authenticated encryption uses fresh nonces and binds tenant and name", () => {
    const a = encryptWorkspaceSecret(value, ORG_A, "KEY");
    const b = encryptWorkspaceSecret(value, ORG_A, "KEY");
    expect(a).not.toContain(value);
    expect(a).not.toBe(b);
    expect(decryptWorkspaceSecret(a, ORG_A, "KEY")).toBe(value);
    expect(() => decryptWorkspaceSecret(a, ORG_B, "KEY")).toThrow();
    expect(() => decryptWorkspaceSecret(a, ORG_A, "OTHER")).toThrow();
    const parts = a.split(".");
    parts[2] = Buffer.alloc(16, 0).toString("base64");
    expect(() => decryptWorkspaceSecret(parts.join("."), ORG_A, "KEY")).toThrow();
    process.env.WORKSPACE_SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    expect(() => decryptWorkspaceSecret(a, ORG_A, "KEY")).toThrow();
    process.env.WORKSPACE_SECRETS_ENCRYPTION_KEY = "bad";
    expect(() => encryptWorkspaceSecret(value, ORG_A, "KEY")).toThrow();
    process.env.WORKSPACE_SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  test("CRUD scopes every operation, returns metadata, and records only successful consumption", async () => {
    const input = { organizationId: ORG_A, name: "KEY", value, createdBy: USER };
    const created = await store.createWorkspaceSecret(input);
    expect(created).toMatchObject({ name: "KEY", lastUsedAt: null });
    expect(JSON.stringify(created)).not.toContain(value);
    expect(await store.listWorkspaceSecrets(ORG_A)).toEqual([created]);
    expect(await store.getWorkspaceSecretMetadata(ORG_A, "KEY")).toEqual(created);
    expect(await store.createWorkspaceSecret(input)).toBeNull();
    expect(await store.createWorkspaceSecret({ ...input, organizationId: ORG_B })).not.toBeNull();
    const rows = await pg.query<{ encryptedValue: string }>(`SELECT "encryptedValue" FROM "WorkspaceSecret" WHERE "organizationId" = $1`, [ORG_A]);
    expect(rows.rows[0].encryptedValue).not.toContain(value);
    expect(await store.getWorkspaceSecretValue(ORG_A, "KEY")).toBe(value);
    expect((await store.getWorkspaceSecretMetadata(ORG_A, "KEY"))?.lastUsedAt).toBeInstanceOf(Date);
    expect(await store.getWorkspaceSecretValue(ORG_B, "MISSING")).toBeNull();
    expect(await store.rotateWorkspaceSecret(ORG_B, "MISSING", value)).toBeNull();
    expect(await store.deleteWorkspaceSecret(ORG_B, "MISSING")).toBe(false);
    const rotated = [value, "rotated"].join("-");
    expect(await store.rotateWorkspaceSecret(ORG_A, "KEY", rotated)).not.toBeNull();
    expect(await store.getWorkspaceSecretValue(ORG_A, "KEY")).toBe(rotated);
    expect(await store.deleteWorkspaceSecret(ORG_A, "KEY")).toBe(true);
    expect(await store.listWorkspaceSecrets(ORG_A)).toEqual([]);
    expect(await store.getWorkspaceSecretValue(ORG_A, "KEY")).toBeNull();
    expect(await store.getWorkspaceSecretValue(ORG_B, "KEY")).toBe(value);
  });

  test("RLS and repaired runtime grants enforce tenant isolation", async () => {
    await store.createWorkspaceSecret({ organizationId: ORG_A, name: "A", value, createdBy: USER });
    await store.createWorkspaceSecret({ organizationId: ORG_B, name: "B", value, createdBy: USER });
    await store.setWorkspaceSecretDetectionEnabled(ORG_B, false);
    await pg.exec(`REVOKE ALL ON "WorkspaceSecret", "WorkspaceSecretSettings" FROM zooka_runtime`);
    await pg.exec(grants);
    await pg.exec(`SET ROLE zooka_runtime; SELECT set_config('app.organization_id', '${ORG_A}', false)`);
    expect((await store.listWorkspaceSecrets(ORG_A)).map((row) => row.name)).toEqual(["A"]);
    expect(await store.listWorkspaceSecrets(ORG_B)).toEqual([]);
    expect(await store.getWorkspaceSecretValue(ORG_B, "B")).toBeNull();
    expect(await store.deleteWorkspaceSecret(ORG_B, "B")).toBe(false);
    expect(await store.getWorkspaceSecretDetectionEnabled(ORG_B)).toBe(true);
    await pg.exec('RESET ROLE; REVOKE SELECT ON "WorkspaceSecretSettings" FROM zooka_runtime; SET ROLE zooka_runtime');
    await expect(store.getChatSecretDetectionEnabled(ORG_A)).rejects.toThrow();
    await expect(store.setWorkspaceSecretDetectionEnabled(ORG_B, true)).rejects.toThrow();
    await expect(store.createWorkspaceSecret({ organizationId: ORG_B, name: "BLOCKED", value, createdBy: USER })).rejects.toThrow();
  });

  test("membership policy survives either migration order", async () => {
    for (const helperFirst of [true, false]) {
      const instance = new PGlite();
      try {
        await instance.exec(`CREATE ROLE zooka_runtime; CREATE TABLE "Organization" (id uuid PRIMARY KEY);
          CREATE TABLE "User" (id uuid PRIMARY KEY); CREATE TABLE "OrganizationMember" ("organizationId" uuid, "userId" uuid);
          INSERT INTO "Organization" VALUES ('${ORG_A}'), ('${ORG_B}'); INSERT INTO "User" VALUES ('${USER}');
          INSERT INTO "OrganizationMember" VALUES ('${ORG_A}', '${USER}')`);
        if (helperFirst) await instance.exec(membership);
        await instance.exec(migration);
        if (!helperFirst) await instance.exec(membership);
        await instance.exec(migration);
        await instance.exec(`INSERT INTO "WorkspaceSecret" ("organizationId", "name", "encryptedValue") VALUES ('${ORG_A}', 'A', 'x'), ('${ORG_B}', 'B', 'x');
          INSERT INTO "WorkspaceSecretSettings" VALUES ('${ORG_A}', false), ('${ORG_B}', false);
          SET ROLE zooka_runtime; SELECT set_config('request.jwt.claims', '{"sub":"${USER}"}', false);
          SELECT set_config('app.organization_id', '${ORG_B}', false)`);
        for (const table of ["WorkspaceSecret", "WorkspaceSecretSettings"]) {
          expect((await instance.query(`SELECT * FROM "${table}"`)).rows).toHaveLength(0);
        }
        await instance.exec(`SELECT set_config('app.organization_id', '${ORG_A}', false)`);
        for (const table of ["WorkspaceSecret", "WorkspaceSecretSettings"]) {
          expect((await instance.query(`SELECT * FROM "${table}"`)).rows).toHaveLength(1);
        }
      } finally { await instance.close(); }
    }
  });

  test("API authorizes all methods, validates strictly, and returns metadata only", async () => {
    state.caller = null;
    expect((await collection.GET(request("GET"))).status).toBe(401);
    state.caller = owner(ORG_A, "member");
    expect((await collection.GET(request("GET"))).status).toBe(403);
    expect((await collection.POST(request("POST", { name: "KEY", value }))).status).toBe(403);
    expect((await item.GET(request("GET"), context("KEY"))).status).toBe(403);
    expect((await item.PATCH(request("PATCH", { value }), context("KEY"))).status).toBe(403);
    expect((await item.DELETE(request("DELETE"), context("KEY"))).status).toBe(403);
    expect((await settings.GET(request("GET"))).status).toBe(403);
    expect((await settings.PATCH(request("PATCH", { enabled: false }))).status).toBe(403);
    state.caller = owner(ORG_A, "admin");
    for (const body of [{ name: "bad", value }, { name: "BAD-NAME", value }, { name: "KEY", value: "" }, { name: "KEY", value: "x".repeat(8193) }, { name: "KEY", value, organizationId: ORG_B }]) {
      expect((await collection.POST(request("POST", body))).status).toBe(400);
    }
    const response = await collection.POST(request("POST", { name: "KEY", value }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain(value);
    expect((await collection.POST(request("POST", { name: "KEY", value }))).status).toBe(409);
    expect(await (await settings.GET(request("GET"))).json()).toEqual({ enabled: true });
    expect((await settings.PATCH(request("PATCH", { enabled: false }))).status).toBe(200);
    expect(await (await settings.GET(request("GET"))).json()).toEqual({ enabled: false });
    expect(await (await item.PATCH(request("PATCH", { value }), context("KEY"))).text()).not.toContain(value);
    state.caller = owner(ORG_B);
    expect(await (await settings.GET(request("GET"))).json()).toEqual({ enabled: true });
    expect((await item.GET(request("GET"), context("KEY"))).status).toBe(404);
    expect((await item.PATCH(request("PATCH", { value }), context("KEY"))).status).toBe(404);
    expect((await item.DELETE(request("DELETE"), context("KEY"))).status).toBe(404);
  });

  test("named GitHub probe uses scoped secret only and never echoes upstream data or errors", async () => {
    await store.createWorkspaceSecret({ organizationId: ORG_A, name: "KEY", value, createdBy: USER });
    const run = (organizationId: string, fetchImpl: typeof fetch) => githubRepoProbe.run({
      organizationId, agentId: "agent", payload: { repo: "ZOOKA-AI/chatbot", secretName: "KEY" },
      signal: new AbortController().signal, fetchImpl,
    });
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(["Bearer", value].join(" "));
      expect(init?.redirect).toBe("error");
      return Response.json({ description: value });
    }) as unknown as typeof fetch;
    expect(JSON.stringify(await run(ORG_A, fetchImpl))).not.toContain(value);
    expect((await run(ORG_B, fetchImpl)).ok).toBe(false);
    const failure = (async () => { throw new Error(value); }) as typeof fetch;
    expect(JSON.stringify(await run(ORG_A, failure))).not.toContain(value);
  });
});
