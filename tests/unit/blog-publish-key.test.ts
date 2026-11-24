import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test, vi } from "vitest";

/**
 * The publishing endpoint must accept exactly two credentials and nothing else:
 * the explicit BLOG_PUBLISH_KEY, and the legacy HMAC derived from AUTH_SECRET.
 *
 * This is the door the daily writing workflow knocks on, so the tests pin both the
 * happy paths and the ways a wrong key must fail: empty, truncated, the right
 * length with wrong bytes, and the HMAC of a different label.
 */

const publishPost = vi.hoisted(() => vi.fn(async (input: { slug: string }) => ({
  slug: input.slug,
  status: "published",
})));

vi.mock("@/lib/blog/store", () => ({ publishPost }));

const ORIGINAL = { ...process.env };

async function route() {
  return import("@/app/api/blog/publish/route");
}

function hmacKey(secret: string) {
  return createHmac("sha256", secret).update("zooka-blog-publish").digest("hex");
}

function post(key: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key !== null) headers["x-blog-key"] = key;
  return new Request("https://zooka-ai.com/api/blog/publish", {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "عنوان تجريبي", body: "م".repeat(220), slug: "test-post" }),
  });
}

beforeEach(() => {
  vi.resetModules();
  publishPost.mockClear();
  delete process.env.BLOG_PUBLISH_KEY;
  delete process.env.AUTH_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

test("accepts the explicit BLOG_PUBLISH_KEY", async () => {
  process.env.BLOG_PUBLISH_KEY = "k".repeat(48);
  const { POST } = await route();
  const response = await POST(post("k".repeat(48)));
  assert.equal(response.status, 200);
  assert.equal(publishPost.mock.calls.length, 1);
});

test("still accepts the legacy HMAC of AUTH_SECRET", async () => {
  process.env.AUTH_SECRET = "a-secret-value-that-is-long-enough";
  const { POST } = await route();
  const response = await POST(post(hmacKey(process.env.AUTH_SECRET)));
  assert.equal(response.status, 200);
});

test("rejects a missing key", async () => {
  process.env.BLOG_PUBLISH_KEY = "k".repeat(48);
  const { POST } = await route();
  const response = await POST(post(null));
  assert.equal(response.status, 401);
  assert.equal(publishPost.mock.calls.length, 0);
});

test("rejects a key of the right length with the wrong bytes", async () => {
  process.env.BLOG_PUBLISH_KEY = "k".repeat(48);
  const { POST } = await route();
  const response = await POST(post("j".repeat(48)));
  assert.equal(response.status, 401);
});

test("rejects a short BLOG_PUBLISH_KEY outright", async () => {
  process.env.BLOG_PUBLISH_KEY = "too-short";
  const { POST } = await route();
  const response = await POST(post("too-short"));
  assert.equal(response.status, 401);
});

test("rejects the HMAC of a different label", async () => {
  process.env.AUTH_SECRET = "a-secret-value-that-is-long-enough";
  const other = createHmac("sha256", process.env.AUTH_SECRET).update("other").digest("hex");
  const { POST } = await route();
  assert.equal((await POST(post(other))).status, 401);
});
