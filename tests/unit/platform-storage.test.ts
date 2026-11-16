import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { platformConfig } from "@/lib/platform/config";
import { assertSafeKey, contentTypeForKey, localDriver, s3Driver, signS3Request, storageDriver } from "@/lib/platform/storage";

/**
 * Storage is the last place to hold a vendor lock, and the first place where an untrusted
 * key becomes a filesystem write. Both concerns are tested here.
 */

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function config(overrides: Record<string, string> = {}) {
  const saved = process.env;
  process.env = { DATABASE_URL: "postgres://u:p@db:5432/x", ...overrides } as unknown as NodeJS.ProcessEnv;
  try {
    return platformConfig();
  } finally {
    process.env = saved;
  }
}

describe("keys are untrusted input", () => {
  test("traversal, absolute paths and NUL bytes are refused", () => {
    assert.throws(() => assertSafeKey("../../etc/passwd"), /escapes/);
    assert.throws(() => assertSafeKey("org/1/../../secret"), /escapes/);
    assert.throws(() => assertSafeKey("a\0b"), /NUL/);
    assert.equal(assertSafeKey("/org/1/file.png"), "org/1/file.png");
  });

  test("content type comes from the extension, defaulting safely", () => {
    assert.equal(contentTypeForKey("a/b.png"), "image/png");
    assert.equal(contentTypeForKey("a/b.mp4"), "video/mp4");
    assert.equal(contentTypeForKey("a/b.unknown"), "application/octet-stream");
  });
});

describe("the local driver round-trips bytes", () => {
  test("put, get, url and delete", async () => {
    dir = await mkdtemp(join(tmpdir(), "zooka-storage-"));
    const cfg = await config({ STORAGE_LOCAL_DIR: dir });
    const driver = localDriver(cfg);

    const bytes = new TextEncoder().encode("hello tenant");
    const stored = await driver.put("org/1/hello.txt", bytes, "text/plain");
    assert.equal(stored.size, 12);

    const read = await driver.get("org/1/hello.txt");
    assert.equal(new TextDecoder().decode(read!.body), "hello tenant");
    assert.match(driver.url("org/1/hello.txt"), /\/api\/files\/org\/1\/hello\.txt$/);

    await driver.delete("org/1/hello.txt");
    assert.equal(await driver.get("org/1/hello.txt"), null);
  });

  test("a traversal key never reaches the filesystem", async () => {
    dir = await mkdtemp(join(tmpdir(), "zooka-storage-"));
    const driver = localDriver(await config({ STORAGE_LOCAL_DIR: dir }));
    await assert.rejects(() => driver.put("../outside.txt", new Uint8Array([1]), "text/plain"), /escapes/);
  });
});

describe("SigV4 signing is deterministic and matches the documented form", () => {
  test("same inputs produce the same signature; the canonical request is inspectable", () => {
    const input = {
      method: "PUT" as const,
      url: "http://127.0.0.1:9000/zooka/org/1/a.txt",
      region: "us-east-1",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "secret",
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      contentType: "text/plain",
      now: new Date("2026-11-16T00:00:00Z"),
    };
    const a = signS3Request(input);
    const b = signS3Request(input);
    assert.equal(a.signature, b.signature);
    assert.match(a.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/20261116\/us-east-1\/s3\/aws4_request/);
    assert.match(a.headers.authorization, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/);
    assert.match(a.canonicalRequest, /^PUT\n\/zooka\/org\/1\/a\.txt\n\ncontent-type:text\/plain/);
  });

  test("the signature changes when the payload changes", () => {
    const base = {
      method: "PUT" as const,
      url: "http://127.0.0.1:9000/zooka/a.txt",
      region: "us-east-1",
      accessKeyId: "AK",
      secretAccessKey: "s",
      contentType: "text/plain",
      now: new Date("2026-11-16T00:00:00Z"),
    };
    const one = signS3Request({ ...base, payloadHash: "a".repeat(64) });
    const two = signS3Request({ ...base, payloadHash: "b".repeat(64) });
    assert.notEqual(one.signature, two.signature);
  });
});

describe("the s3 driver speaks to an endpoint", () => {
  test("put sends a signed request and get returns the bytes", async () => {
    const calls: { method: string; url: string; authorization?: string }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ method: init.method!, url, authorization: (init.headers as Record<string, string>).authorization });
      if (init.method === "PUT") return new Response("", { status: 200 });
      return new Response("payload", { status: 200, headers: { "content-type": "text/plain" } });
    }) as unknown as typeof fetch;

    const cfg = await config({
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "zooka",
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_ACCESS_KEY_ID: "AK",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    const driver = s3Driver(cfg, fakeFetch);

    const stored = await driver.put("org/1/a.txt", new TextEncoder().encode("x"), "text/plain");
    assert.match(stored.url, /^http:\/\/127\.0\.0\.1:9000\/zooka\/org\/1\/a\.txt$/);

    const read = await driver.get("org/1/a.txt");
    assert.equal(new TextDecoder().decode(read!.body), "payload");
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.authorization?.startsWith("AWS4-HMAC-SHA256")));
    assert.equal(calls[0].method, "PUT");
  });

  test("a 404 reads as absent, not as an error", async () => {
    const fakeFetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const cfg = await config({
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "zooka",
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_ACCESS_KEY_ID: "AK",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    assert.equal(await s3Driver(cfg, fakeFetch).get("missing.txt"), null);
  });
});

describe("driver selection", () => {
  test("the configured driver is the one built", async () => {
    assert.equal(storageDriver(await config({ STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: "/tmp/z" })).name, "local");
    assert.equal(
      storageDriver(
        await config({
          STORAGE_DRIVER: "s3",
          S3_BUCKET: "b",
          S3_ACCESS_KEY_ID: "k",
          S3_SECRET_ACCESS_KEY: "s",
        })
      ).name,
      "s3"
    );
  });
});
