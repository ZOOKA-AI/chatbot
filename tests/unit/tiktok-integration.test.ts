import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  initInboxUpload,
  putChunk,
} from "@/lib/integrations/tiktok/api";
import {
  isTiktokConfigured,
  TIKTOK_SCOPES,
  tiktokRedirectUri,
} from "@/lib/integrations/tiktok/config";
import { TIKTOK_DDL } from "@/lib/integrations/tiktok/ddl";
import {
  codeChallengeFor,
  createTiktokState,
  readTiktokState,
} from "@/lib/integrations/tiktok/state";
import {
  checkTiktokMedia,
  contentRangeHeader,
  planTiktokChunks,
  TIKTOK_DEFAULT_CHUNK_BYTES,
  TIKTOK_MAX_UPLOAD_BYTES,
  TIKTOK_MIN_CHUNK_BYTES,
  tiktokChunkRanges,
} from "@/lib/integrations/tiktok/validate";

const SECRET = "test-state-secret-value-32-bytes";

test("only the two scopes the product actually uses are requested", () => {
  assert.deepEqual([...TIKTOK_SCOPES], ["user.info.basic", "video.upload"]);
  assert.equal(TIKTOK_SCOPES.includes("video.publish" as never), false);
});

test("the callback lives on our own domain unless configured otherwise", () => {
  delete process.env.TIKTOK_REDIRECT_BASE_URL;
  assert.equal(
    tiktokRedirectUri(),
    "https://zooka-ai.com/api/integrations/tiktok/callback"
  );
  process.env.TIKTOK_REDIRECT_BASE_URL = "https://preview.example.test/";
  assert.equal(
    tiktokRedirectUri(),
    "https://preview.example.test/api/integrations/tiktok/callback"
  );
  delete process.env.TIKTOK_REDIRECT_BASE_URL;
});

test("the integration reports itself unconfigured without credentials", () => {
  delete process.env.TIKTOK_CLIENT_KEY;
  delete process.env.TIKTOK_CLIENT_SECRET;
  assert.equal(isTiktokConfigured(), false);
  process.env.TIKTOK_CLIENT_KEY = "key";
  process.env.TIKTOK_CLIENT_SECRET = "secret";
  assert.equal(isTiktokConfigured(), true);
  delete process.env.TIKTOK_CLIENT_KEY;
  delete process.env.TIKTOK_CLIENT_SECRET;
});

test("state round-trips and binds workspace, user and PKCE verifier", () => {
  const ticket = createTiktokState(
    { organizationId: "org-1", userId: "user-1" },
    SECRET
  );
  assert.equal(ticket.codeChallenge, codeChallengeFor(ticket.codeVerifier));
  const read = readTiktokState(ticket.cookie, ticket.nonce, SECRET);
  assert.ok(read);
  assert.equal(read?.organizationId, "org-1");
  assert.equal(read?.userId, "user-1");
  assert.equal(read?.codeVerifier, ticket.codeVerifier);
});

test("a forged, replayed or mismatched callback is refused", () => {
  const ticket = createTiktokState(
    { organizationId: "org-1", userId: "user-1" },
    SECRET
  );
  assert.equal(readTiktokState(ticket.cookie, "different-nonce", SECRET), null);
  assert.equal(readTiktokState(ticket.cookie, ticket.nonce, "other-secret"), null);
  assert.equal(readTiktokState(undefined, ticket.nonce, SECRET), null);
  assert.equal(readTiktokState("garbage", ticket.nonce, SECRET), null);

  const parts = ticket.cookie.split(".");
  parts[1] = "user-2";
  assert.equal(readTiktokState(parts.join("."), ticket.nonce, SECRET), null);
});

test("chunk plan obeys the 5MB floor and covers the file exactly", () => {
  const small = planTiktokChunks(1024 * 1024);
  assert.deepEqual(small, { chunkSize: 1024 * 1024, totalChunkCount: 1 });

  const boundary = planTiktokChunks(TIKTOK_MIN_CHUNK_BYTES);
  assert.deepEqual(boundary, {
    chunkSize: TIKTOK_MIN_CHUNK_BYTES,
    totalChunkCount: 1,
  });

  const twelve = planTiktokChunks(12 * 1024 * 1024);
  assert.equal(twelve.chunkSize, TIKTOK_DEFAULT_CHUNK_BYTES);
  assert.equal(twelve.totalChunkCount, 2);
  const ranges = tiktokChunkRanges(12 * 1024 * 1024, twelve);
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].start, 0);
  assert.equal(ranges[1].end, 12 * 1024 * 1024 - 1);
  assert.equal(ranges[0].end + 1, ranges[1].start);
  assert.equal(ranges[0].length + ranges[1].length, 12 * 1024 * 1024);

  const odd = planTiktokChunks(21 * 1024 * 1024);
  const oddRanges = tiktokChunkRanges(21 * 1024 * 1024, odd);
  assert.equal(oddRanges.length, 3);
  assert.equal(
    oddRanges.reduce((sum, range) => sum + range.length, 0),
    21 * 1024 * 1024
  );
});

test("content-range header matches the documented byte form", () => {
  assert.equal(
    contentRangeHeader({ start: 0, end: 10485759, length: 10485760 }),
    "bytes 0-10485759/10485760"
  );
});

test("media validation refuses empty, oversized and non-video files", () => {
  assert.equal(checkTiktokMedia({ size: 0, mime: "video/mp4" }).problem, "empty_file");
  assert.equal(
    checkTiktokMedia({ size: TIKTOK_MAX_UPLOAD_BYTES + 1, mime: "video/mp4" })
      .problem,
    "file_too_large"
  );
  assert.equal(
    checkTiktokMedia({ size: 1024, mime: "application/pdf" }).problem,
    "unsupported_type"
  );
  assert.equal(checkTiktokMedia({ size: 1024, mime: "video/mp4" }).ok, true);
});

test("inbox init sends FILE_UPLOAD chunk math and never a privacy level", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(
      JSON.stringify({
        data: { publish_id: "v_pub_file~1", upload_url: "https://upload.example/1" },
        error: { code: "ok", message: "" },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const result = await initInboxUpload("token", {
    size: 12 * 1024 * 1024,
    chunkSize: TIKTOK_DEFAULT_CHUNK_BYTES,
    totalChunkCount: 2,
  });
  globalThis.fetch = original;

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
  const body = calls[0].body as { source_info: Record<string, unknown> };
  assert.deepEqual(body.source_info, {
    source: "FILE_UPLOAD",
    video_size: 12 * 1024 * 1024,
    chunk_size: TIKTOK_DEFAULT_CHUNK_BYTES,
    total_chunk_count: 2,
  });
  assert.equal("post_info" in body, false);
  assert.equal(JSON.stringify(body).includes("privacy_level"), false);
});

test("an upload chunk carries the exact Content-Range and length", async () => {
  const seen: Array<Record<string, string>> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    seen.push(init.headers as Record<string, string>);
    return new Response("", { status: 201 });
  }) as typeof fetch;

  const chunk = Buffer.alloc(8);
  const result = await putChunk("https://upload.example/1", chunk, {
    start: 0,
    end: 7,
    length: 8,
  });
  globalThis.fetch = original;

  assert.equal(result.ok, true);
  assert.equal(seen[0]["Content-Range"], "bytes 0-7/8");
  assert.equal(seen[0]["Content-Length"], "8");
});

test("the pending migration file equals the DDL the admin path executes", () => {
  const file = readFileSync(
    join(process.cwd(), "lib/db/migrations/pending/0064_tiktok_integration.sql"),
    "utf8"
  );
  const statements = file
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
    .map((statement) => statement.replace(/\s+/g, " ").toLowerCase());
  const ddl = TIKTOK_DDL.map((statement) =>
    statement.trim().replace(/\s+/g, " ").toLowerCase()
  );
  assert.deepEqual(statements, ddl);
});

test("tokens are never part of a status payload shape", async () => {
  const { readFileSync: read } = await import("node:fs");
  const route = read(
    join(process.cwd(), "app/api/integrations/tiktok/status/route.ts"),
    "utf8"
  );
  assert.equal(route.includes("accessToken"), false);
  assert.equal(route.includes("encryptedTokens"), false);
});
