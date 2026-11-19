import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { platformConfig } from "@/lib/platform/config";

/**
 * Configuration is where self-hosting succeeds or fails quietly. Each case below is a
 * mistake an operator will actually make: a typo in a number, a driver name that is
 * almost right, an s3 selection with no bucket.
 */

const BASE = { DATABASE_URL: "postgres://u:p@db:5432/zooka" } as const;

let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = { ...process.env };
  for (const key of Object.keys(process.env)) if (!(key in BASE)) delete process.env[key];
  Object.assign(process.env, BASE);
});
afterEach(() => {
  process.env = saved;
});

describe("platform configuration", () => {
  test("an empty install gets working defaults and no hidden ceilings", () => {
    const config = platformConfig();
    assert.equal(config.storage.driver, "local");
    assert.equal(config.models.provider, "gateway");
    assert.equal(config.alerts.webhookUrl, null, "alerts must not deliver until a channel exists");
    assert.ok(config.worker.concurrency >= 1);
    assert.ok(config.scheduler.batchSize >= 1);
  });

  test("quotas come from the environment, with no application-level maximum", () => {
    process.env.WORKER_CONCURRENCY = "64";
    process.env.SCHEDULER_GLOBAL_LIMIT = "500";
    process.env.SCHEDULER_PER_WORKSPACE_LIMIT = "120";
    const config = platformConfig();
    assert.equal(config.worker.concurrency, 64);
    assert.equal(config.scheduler.globalLimit, 500);
    assert.equal(config.scheduler.perWorkspaceLimit, 120);
  });

  test("a malformed number fails loudly instead of becoming NaN", () => {
    process.env.WORKER_CONCURRENCY = "four";
    assert.throws(() => platformConfig(), /WORKER_CONCURRENCY must be an integer/);
  });

  test("an unknown driver is refused, and lists what is allowed", () => {
    process.env.STORAGE_DRIVER = "s4";
    assert.throws(() => platformConfig(), /STORAGE_DRIVER must be one of local, s3, vercel-blob/);
  });

  test("s3 without a bucket is refused at read time, not at first upload", () => {
    process.env.STORAGE_DRIVER = "s3";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    assert.throws(() => platformConfig(), /S3_BUCKET is required/);
  });

  test("the worker identity is stable for a container, not random per restart", () => {
    process.env.HOSTNAME = "worker-7f9c";
    assert.equal(platformConfig().worker.id, "worker-7f9c");
    process.env.WORKER_ID = "explicit";
    assert.equal(platformConfig().worker.id, "explicit");
  });

  test("no database is a startup failure, not a runtime surprise", () => {
    delete process.env.DATABASE_URL;
    assert.throws(() => platformConfig(), /DATABASE_URL/);
  });
});
