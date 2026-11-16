import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import * as schema from "@/lib/db/schema";

/**
 * The studio's rules, tested without trusting the client.
 *
 * Two questions matter most and are answered here: what a browser may hand us, and what a workspace
 * may read back. Both are places where a plausible implementation leaks — a size limit that is not
 * enforced, or an asset id that resolves across tenants.
 */

const holder = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));

import { acceptUpload, getAsset, listAssets, StudioError, usage } from "@/lib/studio/media";

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";

let pg: PGlite;

beforeEach(async () => {
  pg = new PGlite();
  for (const file of [
    "0027_agent_command_center.sql",
    "pending/0028_agent_tenant_scope.sql",
    "pending/0033_decision_audit_uniqueness.sql",
    "pending/0038_schedule_and_agent_model.sql",
    "pending/0040_agent_tools_and_instructions.sql",
    "pending/0041_workspace_projects.sql",
    "pending/0042_project_documents.sql",
    "pending/0043_browser_sessions.sql",
    "pending/0044_studio_media.sql",
  ]) {
    for (const part of readFileSync(join(process.cwd(), "lib/db/migrations", file), "utf8").split("--> statement-breakpoint")) {
      if (part.trim()) await pg.exec(part);
    }
  }
  holder.db = drizzle(pg, { schema });
  await pg.query(
    `insert into "AgentProject"(id,"organizationId",name) values ($1,'org-alpha','A'), ($2,'org-beta','B')`,
    [PROJECT_A, PROJECT_B]
  );
});

afterEach(async () => {
  await pg.close();
});

function insertAsset(values: Record<string, unknown>) {
  return pg.query(
    `insert into "StudioAsset"("organizationId","projectId",kind,source,"storagePath","mimeType",bytes,status,label)
     values ($1,$2,$3,'upload',$4,$5,$6,'ready',$7) returning id`,
    [values.organizationId, values.projectId ?? null, values.kind, `/tmp/${Math.random()}.bin`, values.mimeType, values.bytes, values.label ?? null]
  );
}

describe("what a browser may hand the studio", () => {
  test("known types are accepted and mapped to a kind", () => {
    assert.deepEqual(acceptUpload({ mimeType: "image/png", bytes: 1000 }), { kind: "image", ext: ".png" });
    assert.deepEqual(acceptUpload({ mimeType: "video/mp4", bytes: 1000 }), { kind: "video", ext: ".mp4" });
    assert.deepEqual(acceptUpload({ mimeType: "audio/mpeg; charset=binary", bytes: 1000 }), { kind: "audio", ext: ".mp3" });
  });

  test("an unknown type is refused, so a renamed file cannot pose as media", () => {
    for (const mimeType of ["application/x-msdownload", "text/html", "image/svg+xml", ""]) {
      assert.throws(
        () => acceptUpload({ mimeType, bytes: 10 }),
        (error: unknown) => error instanceof StudioError && error.code === "unsupported_type"
      );
    }
  });

  test("the size limit is per kind and it is enforced", () => {
    assert.throws(
      () => acceptUpload({ mimeType: "image/png", bytes: 21 * 1024 * 1024 }),
      (error: unknown) => error instanceof StudioError && error.code === "file_too_large"
    );
    // A video may be larger than an image and is still refused above its own limit.
    assert.doesNotThrow(() => acceptUpload({ mimeType: "video/mp4", bytes: 21 * 1024 * 1024 }));
    assert.throws(
      () => acceptUpload({ mimeType: "video/mp4", bytes: 300 * 1024 * 1024 }),
      (error: unknown) => error instanceof StudioError && error.code === "file_too_large"
    );
    assert.throws(
      () => acceptUpload({ mimeType: "image/png", bytes: 0 }),
      (error: unknown) => error instanceof StudioError && error.code === "empty_file"
    );
  });
});

describe("what a workspace may read back", () => {
  test("an asset is visible only inside its own workspace", async () => {
    const created = await insertAsset({ organizationId: ORG_A, kind: "image", mimeType: "image/png", bytes: 500 });
    const id = (created.rows[0] as { id: string }).id;
    assert.ok(await getAsset(ORG_A, id));
    assert.equal(await getAsset(ORG_B, id), null, "another workspace sees nothing");
    assert.deepEqual(await listAssets(ORG_B), []);
  });

  test("listing can be scoped to a project without leaking the rest", async () => {
    await insertAsset({ organizationId: ORG_A, projectId: PROJECT_A, kind: "image", mimeType: "image/png", bytes: 10 });
    await insertAsset({ organizationId: ORG_A, kind: "image", mimeType: "image/png", bytes: 20 });
    const scoped = await listAssets(ORG_A, { projectId: PROJECT_A });
    assert.equal(scoped.length, 1);
    assert.equal((await listAssets(ORG_A)).length, 2);
  });

  test("usage is counted per workspace, which is what the quota is measured against", async () => {
    await insertAsset({ organizationId: ORG_A, kind: "image", mimeType: "image/png", bytes: 300 });
    await insertAsset({ organizationId: ORG_A, kind: "image", mimeType: "image/png", bytes: 200 });
    await insertAsset({ organizationId: ORG_B, kind: "image", mimeType: "image/png", bytes: 999 });
    assert.deepEqual(await usage(ORG_A), { assets: 2, bytes: 500 });
    assert.deepEqual(await usage(ORG_B), { assets: 1, bytes: 999 });
  });

  test("an asset cannot be filed under a project from another workspace", async () => {
    await assert.rejects(() =>
      insertAsset({ organizationId: ORG_A, projectId: PROJECT_B, kind: "image", mimeType: "image/png", bytes: 10 })
    );
  });

  test("only the three kinds exist, and only upload or derived", async () => {
    await assert.rejects(() =>
      pg.query(`insert into "StudioAsset"("organizationId",kind,source,"storagePath","mimeType",bytes) values ($1,'document','upload','/tmp/x','text/plain',1)`, [ORG_A])
    );
  });
});
