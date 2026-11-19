import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { test, vi } from "vitest";

const { holder } = vi.hoisted(() => ({ holder: { db: null as any } }));
vi.mock("server-only", () => ({}));
vi.mock("postgres", () => ({ default: () => ({}) }));
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: () =>
    new Proxy(
      {},
      {
        get(_target, key) {
          const value = holder.db[key];
          return typeof value === "function" ? value.bind(holder.db) : value;
        },
      }
    ),
}));

import { reserveGatewayImage } from "@/lib/db/queries";

const org = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
test("actual admission SQL caps attempts by UTC day and workspace, including failed attempts", async () => {
  const client = new PGlite();
  holder.db = drizzle(client);
  try {
    await client.exec(
      'CREATE TABLE "MediaJob" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL, "actionType" varchar(16) NOT NULL, "prompt" text NOT NULL, "status" varchar DEFAULT \'queued\', "assetUrl" text, "error" text, "createdAt" timestamp DEFAULT now(), "updatedAt" timestamp DEFAULT now());'
    );
    for (let i = 0; i < 3; i++) {
      const job = await reserveGatewayImage({
        organizationId: org,
        actionType: "IMAGE",
        prompt: "test",
      });
      assert.ok(job);
      await client.query('UPDATE "MediaJob" SET status=$1 WHERE id=$2', [
        "failed",
        job.id,
      ]);
    }
    assert.equal(
      await reserveGatewayImage({
        organizationId: org,
        actionType: "CARTOON",
        prompt: "test",
      }),
      null
    );
    assert.ok(
      await reserveGatewayImage({
        organizationId: other,
        actionType: "IMAGE",
        prompt: "test",
      })
    );
    await client.query(
      'UPDATE "MediaJob" SET "createdAt" = (now() at time zone \'UTC\')::date - interval \'1 day\' WHERE "organizationId"=$1',
      [org]
    );
    assert.ok(
      await reserveGatewayImage({
        organizationId: org,
        actionType: "IMAGE",
        prompt: "test",
      })
    );
  } finally {
    await client.close();
  }
}, 60_000);
