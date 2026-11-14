import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown, context: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/lib/integrations/google-drive/server", () => ({
  getGoogleDriveAccessToken: vi.fn(),
  isGoogleDriveConfigured: () => false,
}));
vi.mock("@/lib/integrations/oauth/config", () => ({
  isOAuthProviderConfigured: () => false,
  isOAuthProviderId: (value: string) =>
    ["github", "vercel", "x"].includes(value),
}));

import { fileURLToPath } from "node:url";

vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: state.context }));

import { GET as overview } from "@/app/api/creative/overview/route";
import { readHub } from "@/lib/integration-hub/server";
import { migratePglite } from "../helpers/migrate-pglite";

test("stored OAuth metadata and probe results cannot cross workspace boundaries", async () => {
  const client = new PGlite();
  state.db = drizzle(client);
  try {
    await migratePglite(client, {
      migrationsFolder: fileURLToPath(
        new URL("../../lib/db/migrations", import.meta.url)
      ),
    });
    const first = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    await client.query(
      'INSERT INTO "Organization" (id,name) VALUES ($1,$2),($3,$4)',
      [first, "one", other, "other"]
    );
    await client.query(
      'INSERT INTO "OAuthConnection" ("organizationId",provider,"encryptedTokens","accountName") VALUES ($1,$2,$3,$4)',
      [other, "github", "private-ciphertext", "other-account"]
    );
    state.context.mockResolvedValue({
      organizationId: first,
      user: { type: "regular" },
    });
    await client.query(
      `INSERT INTO "MediaJob" ("organizationId","actionType",prompt,status) VALUES ($1,'IMAGE','private prompt','succeeded')`,
      [other]
    );
    const response = await overview(
      new Request("https://example.test/api/creative/overview?days=7")
    );
    expect(response.status).toBe(200);
    const metrics = await response.json();
    expect(metrics.media).toEqual([]);
    expect(metrics.estimatedCost).toBe(null);
    expect(JSON.stringify(metrics)).not.toContain("private prompt");
    expect(
      (
        await overview(
          new Request("https://example.test/api/creative/overview?days=9999")
        )
      ).status
    ).toBe(400);
    const own = await readHub(first);
    expect(own.find((p) => p.id === "github")?.state).toBe("NOT CONFIGURED");
    expect(JSON.stringify(own)).not.toContain("other-account");
    expect(JSON.stringify(own)).not.toContain("private-ciphertext");
    const separate = await readHub(other);
    expect(separate.find((p) => p.id === "github")?.state).toBe("CONFIGURED");
    expect(separate.find((p) => p.id === "github")?.account).toBe(
      "other-account"
    );
    expect(JSON.stringify(separate)).not.toContain("private-ciphertext");
  } finally {
    await client.close();
  }
}, 60_000);
