import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, test, vi } from "vitest";

const { update, read, workspace } = vi.hoisted(() => ({
  update: vi.fn(),
  read: vi.fn(),
  workspace: vi.fn(),
}));
vi.mock("@/lib/db/queries", () => ({
  finishMediaJob: update,
  getMediaJob: read,
}));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: workspace }));

import { POST } from "@/app/api/media-engine/callback/route";
import { GET } from "@/app/api/media-engine/route";
import { mediaJobUpdateQuery } from "@/lib/db/media-job-state";
import {
  createMediaCallbackRequest,
  sendMediaCallback,
} from "../../scripts/media-callback-sender.mjs";

const org = "11111111-1111-4111-8111-111111111111";
const job = "22222222-2222-4222-8222-222222222222";
const config = {
  callbackUrl: "https://receiver.example.test/api/media-engine/callback",
  secret: "integration-test-only-signing-key",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("reference sender -> real callback -> migrated PostgreSQL -> workspace status read", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../../lib/db/migrations", import.meta.url)
      ),
    });
    await client.query(
      'INSERT INTO "Organization" ("id", "name") VALUES ($1, $2)',
      [org, "Test"]
    );
    await client.query(
      'INSERT INTO "MediaJob" ("id", "organizationId", "actionType", "prompt") VALUES ($1, $2, $3, $4)',
      [job, org, "IMAGE", "مدينة مستقبلية"]
    );
    update.mockImplementation(
      async (input) =>
        (await db.execute(mediaJobUpdateQuery(input))).rows[0] ?? null
    );
    read.mockImplementation(
      async (id, organizationId) =>
        (
          await client.query(
            'SELECT * FROM "MediaJob" WHERE "id" = $1 AND "organizationId" = $2',
            [id, organizationId]
          )
        ).rows[0] ?? null
    );
    workspace.mockResolvedValue({
      user: { type: "regular" },
      organizationId: org,
    });
    vi.stubEnv("MEDIA_ENGINE_WEBHOOK_SECRET", config.secret);
    vi.stubEnv("MEDIA_ENGINE_ASSET_HOSTS", "assets.example.test");
    // Only the transport is in-process; route verification and SQL are real.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      assert.ok(input instanceof Request);
      return POST(input);
    });
    const running = await sendMediaCallback(
      { jobId: job, status: "running" },
      config
    );
    assert.equal(running.ignored, false);
    const payload = {
      jobId: job,
      status: "succeeded",
      assetUrl: "https://assets.example.test/generated.png",
    };
    assert.equal((await sendMediaCallback(payload, config)).ignored, false);
    assert.equal((await sendMediaCallback(payload, config)).ignored, true);
    assert.equal(
      (
        await sendMediaCallback(
          { jobId: job, status: "failed", error: "Late failure" },
          config
        )
      ).ignored,
      true
    );
    const status = await GET(
      new Request(`https://receiver.example.test/api/media-engine?jobId=${job}`)
    );
    assert.equal(status.status, 200);
    const result = await status.json();
    assert.equal(result.status, "succeeded");
    assert.equal(result.assetUrl, payload.assetUrl);
    assert.equal(result.error, null);
    workspace.mockResolvedValueOnce({
      user: { type: "regular" },
      organizationId: "33333333-3333-4333-8333-333333333333",
    });
    assert.equal(
      (
        await GET(
          new Request(
            `https://receiver.example.test/api/media-engine?jobId=${job}`
          )
        )
      ).status,
      404
    );
    const tampered = createMediaCallbackRequest(payload, {
      ...config,
      secret: "wrong-test-key",
    });
    assert.equal((await POST(tampered)).status, 401);
    const stored = await client.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM "MediaJob"'
    );
    assert.equal(stored.rows[0]?.count, 1);
  } finally {
    await client.close();
  }
}, 60_000);

test("sender rejects insecure targets, missing configuration and oversized bodies without network", () => {
  for (const callbackUrl of [
    "http://receiver.example.test/api/media-engine/callback",
    "https://user:password@receiver.example.test/api/media-engine/callback",
    "https://receiver.example.test/other",
    `${config.callbackUrl}?secret=bad`,
  ]) {
    assert.throws(() =>
      createMediaCallbackRequest({}, { ...config, callbackUrl })
    );
  }
  assert.throws(() =>
    createMediaCallbackRequest({}, { ...config, secret: "" })
  );
  assert.throws(() =>
    createMediaCallbackRequest({ message: "x".repeat(16_385) }, config)
  );
});

test("sender fails closed on redirects, HTTP errors and invalid acknowledgements", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  fetchMock.mockResolvedValueOnce(
    new Response("private upstream detail", { status: 500 })
  );
  await assert.rejects(sendMediaCallback({}, config), /HTTP 500/);
  const request = fetchMock.mock.calls[0]?.[0];
  assert.ok(request instanceof Request);
  assert.equal(request.redirect, "error");
  fetchMock.mockResolvedValueOnce(Response.json({ success: true }));
  await assert.rejects(
    sendMediaCallback({}, config),
    /Invalid callback acknowledgement/
  );
});
