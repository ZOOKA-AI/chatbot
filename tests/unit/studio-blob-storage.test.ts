import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import * as schema from "@/lib/db/schema";

/**
 * Studio bytes must outlive the function instance that produced them.
 *
 * A serverless filesystem is gone after a redeploy or a cold start, so an asset row that points at
 * `/tmp/...` opens for a few minutes and then 500s. These tests pin the contract: every write goes to
 * private Blob, every read comes back from Blob, a fresh module instance (the stand-in for "after a
 * redeploy") still reads the bytes, nothing is left on the local filesystem, and a local path can never
 * be recorded on a row.
 */

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const holder = vi.hoisted(() => ({
  db: null as unknown,
  blobs: new Map<string, { bytes: Buffer; contentType: string; access: string }>(),
  puts: [] as Array<{ pathname: string; access: string; contentType: string; addRandomSuffix: boolean }>,
  deletes: [] as string[],
  writes: [] as string[],
  fakeProbe: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));

// An in-memory private Blob store with the same surface the studio uses.
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string, body: Buffer, options: { access: string; contentType: string; addRandomSuffix: boolean }) => {
    holder.puts.push({ pathname, ...options });
    const stored = options.addRandomSuffix ? pathname.replace(/(\.[a-z0-9]+)$/i, "-r4nd0m$1") : pathname;
    holder.blobs.set(stored, { bytes: Buffer.from(body), contentType: options.contentType, access: options.access });
    return { pathname: stored, url: `https://blob.test/${stored}` };
  }),
  get: vi.fn(async (pathname: string, options: { access: string }) => {
    const blob = holder.blobs.get(pathname);
    if (!blob || options.access !== blob.access) return null;
    return {
      statusCode: 200,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(blob.bytes));
          controller.close();
        },
      }),
      blob: { contentType: blob.contentType, etag: "e" },
    };
  }),
  del: vi.fn(async (pathname: string) => {
    holder.deletes.push(pathname);
    holder.blobs.delete(pathname);
  }),
}));

// Every local write is recorded so the test can prove none of them is outside scratch.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: vi.fn(async (...args: Parameters<typeof actual.writeFile>) => {
      holder.writes.push(String(args[0]));
      return actual.writeFile(...args);
    }),
  };
});

// Without ffmpeg on the machine, ffprobe answers with a fixed 64x64 probe so the storage contract is
// still exercised; with ffmpeg, the real binary runs.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  const realRun = promisify(actual.execFile);
  const execFile = ((...args: unknown[]) => (actual.execFile as (...a: unknown[]) => unknown)(...args)) as typeof actual.execFile;
  Object.defineProperty(execFile, promisify.custom, {
    value: async (command: string, commandArgs: string[], options?: object) => {
      if (holder.fakeProbe && command === "ffprobe") {
        return { stdout: JSON.stringify({ streams: [{ codec_type: "video", width: 64, height: 64 }], format: {} }), stderr: "" };
      }
      return realRun(command, commandArgs, options ?? {});
    },
  });
  return { ...actual, execFile };
});

const ORG = "786e49db-5400-42b1-9bf2-f41ab1b864ca";
const OTHER_ORG = "11111111-2222-4333-8444-555555555555";
const SCRATCH_PREFIX = "zooka-studio-scratch-";

function scratchDirectories(): string[] {
  return readdirSync(tmpdir()).filter((name) => name.startsWith(SCRATCH_PREFIX));
}

function tinyPng(width: number, height: number): Buffer {
  return execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `color=c=red:s=${width}x${height}`,
    "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-",
  ]);
}

// A real PNG signature with an IHDR, enough for the type check; ffprobe is faked when this is used.
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000040000000400806000000aa6971de",
  "hex"
);

let pg: PGlite;
let scratchBefore: string[];

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
  holder.blobs.clear();
  holder.puts.length = 0;
  holder.deletes.length = 0;
  holder.writes.length = 0;
  holder.fakeProbe = !hasFfmpeg;
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  scratchBefore = scratchDirectories();
});

afterEach(async () => {
  await pg.close();
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

/** No local write outside a scratch directory, and every scratch directory is gone afterwards. */
function assertNothingPersistedLocally() {
  for (const path of holder.writes) {
    assert.ok(path.startsWith(join(tmpdir(), SCRATCH_PREFIX)), `local write outside scratch: ${path}`);
  }
  assert.deepEqual(scratchDirectories(), scratchBefore, "a scratch directory was left behind");
}

describe("the guard refuses local paths on a studio row", () => {
  test("only a blob pathname may be recorded", async () => {
    const { assertDurableStoragePath } = await import("@/lib/studio/storage");
    for (const local of ["/tmp/zooka-studio/org/a.jpg", "relative/a.jpg", "./a.png", "C:\\a.png", "blob:", "", "file:///tmp/a.png"]) {
      assert.throws(() => assertDurableStoragePath(local), (error: { code?: string }) => error.code === "local_storage_forbidden", local);
    }
    assert.equal(assertDurableStoragePath(`blob:${ORG}/studio-media/a.jpg`), `blob:${ORG}/studio-media/a.jpg`);
  });

  test("the pathname is built from ids, and traversal is refused", async () => {
    const { studioBlobPathname } = await import("@/lib/studio/storage");
    assert.equal(studioBlobPathname(ORG, "abc-123", ".png"), `${ORG}/studio-media/abc-123.png`);
    assert.throws(() => studioBlobPathname("../etc", "a", ".png"));
    assert.throws(() => studioBlobPathname(ORG, "../../a", ".png"));
    assert.throws(() => studioBlobPathname(ORG, "a", ".png/../x"));
  });

  test("without a Blob token nothing is written anywhere and no row is created", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const { store } = await import("@/lib/studio/media");
    await assert.rejects(
      store({ organizationId: ORG, projectId: null, createdBy: null, mimeType: "image/png", bytes: FAKE_PNG }),
      (error: { code?: string }) => error.code === "storage_not_configured"
    );
    assert.equal(holder.puts.length, 0);
    assert.equal(holder.writes.length, 0);
    const rows = await pg.query(`select count(*)::int as n from "StudioAsset"`);
    assert.equal((rows.rows[0] as { n: number }).n, 0);
  });
});

describe("an upload is written to Blob and read back from Blob", () => {
  test("store() puts private bytes under the workspace prefix and records blob:<pathname>", async () => {
    holder.fakeProbe = true;
    const { store } = await import("@/lib/studio/media");
    const row = await store({ organizationId: ORG, projectId: null, createdBy: null, mimeType: "image/png", bytes: FAKE_PNG });

    assert.equal(holder.puts.length, 1);
    assert.equal(holder.puts[0].access, "private");
    assert.equal(holder.puts[0].contentType, "image/png");
    assert.equal(holder.puts[0].pathname, `${ORG}/studio-media/${row.id}.png`);
    assert.match(row.storagePath, new RegExp(`^blob:${ORG}/studio-media/${row.id}-r4nd0m\\.png$`));
    assert.equal(row.status, "ready");
    assert.equal(row.width, 64);
    assertNothingPersistedLocally();
  });

  test("the bytes still open from a fresh module instance, the stand-in for a redeploy", async () => {
    holder.fakeProbe = true;
    const first = await import("@/lib/studio/media");
    const row = await first.store({ organizationId: ORG, projectId: null, createdBy: null, mimeType: "image/png", bytes: FAKE_PNG });

    vi.resetModules();
    const fresh = await import("@/lib/studio/media");
    const { asset, bytes } = await fresh.readAssetBytes(ORG, row.id);
    assert.equal(asset.id, row.id);
    assert.deepEqual(Buffer.from(bytes), FAKE_PNG);
    // Nothing named after the asset exists on this machine: the read came from Blob.
    assert.equal(readdirSync(tmpdir()).some((name) => name.includes(row.id)), false);
  });

  test("another workspace cannot read the bytes", async () => {
    holder.fakeProbe = true;
    const { store, readAssetBytes } = await import("@/lib/studio/media");
    const row = await store({ organizationId: ORG, projectId: null, createdBy: null, mimeType: "image/png", bytes: FAKE_PNG });
    await assert.rejects(readAssetBytes(OTHER_ORG, row.id), (error: { code?: string }) => error.code === "asset_not_found");
  });

  test("deleting an asset deletes its blob", async () => {
    holder.fakeProbe = true;
    const { store, deleteAsset } = await import("@/lib/studio/media");
    const row = await store({ organizationId: ORG, projectId: null, createdBy: null, mimeType: "image/png", bytes: FAKE_PNG });
    await deleteAsset(ORG, row.id);
    assert.deepEqual(holder.deletes, [row.storagePath.slice("blob:".length)]);
    assert.equal(holder.blobs.size, 0);
  });

  test("a legacy row whose local file is gone answers asset_bytes_missing, not a crash", async () => {
    const inserted = await pg.query(
      `insert into "StudioAsset"("organizationId",kind,source,"storagePath","mimeType",bytes,status)
       values ($1,'image','upload','/tmp/zooka-studio/gone/never.jpg','image/jpeg',10,'ready') returning id`,
      [ORG]
    );
    const { readAssetBytes } = await import("@/lib/studio/media");
    await assert.rejects(
      readAssetBytes(ORG, (inserted.rows[0] as { id: string }).id),
      (error: { code?: string }) => error.code === "asset_bytes_missing"
    );
  });
});

describe.skipIf(!hasFfmpeg)("an edit reads its source from Blob and writes its result to Blob (real ffmpeg)", () => {
  test("resize: the derived asset is a real 32x32 PNG in Blob and nothing is left on disk", async () => {
    const { store, editImage, readAssetBytes } = await import("@/lib/studio/media");
    const source = await store({ organizationId: ORG, projectId: null, createdBy: null, mimeType: "image/png", bytes: tinyPng(64, 64) });
    assert.equal(source.width, 64);

    const derived = await editImage({ organizationId: ORG, assetId: source.id, operation: { op: "resize", width: 32, height: 32 } });
    assert.match(derived.storagePath, new RegExp(`^blob:${ORG}/studio-media/${derived.id}-r4nd0m\\.png$`));
    assert.equal(derived.width, 32);
    assert.equal(derived.height, 32);
    assert.equal(holder.puts.length, 2);

    vi.resetModules();
    const { bytes } = await readAssetBytes(ORG, derived.id);
    assert.equal(Buffer.from(bytes).subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(bytes.length, derived.bytes);
    assertNothingPersistedLocally();
  });

  test("a failed edit leaves no scratch behind and no row", async () => {
    const { store, editImage } = await import("@/lib/studio/media");
    const source = await store({ organizationId: ORG, projectId: null, createdBy: null, mimeType: "image/png", bytes: tinyPng(64, 64) });
    await assert.rejects(
      editImage({ organizationId: ORG, assetId: source.id, operation: { op: "resize", width: 1, height: 1 } }),
      (error: { code?: string }) => error.code === "invalid_dimensions"
    );
    const rows = await pg.query(`select count(*)::int as n from "StudioAsset"`);
    assert.equal((rows.rows[0] as { n: number }).n, 1);
    assertNothingPersistedLocally();
  });
});
