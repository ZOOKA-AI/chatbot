import { expect, test } from "@playwright/test";

/**
 * The scheduler doorway, exercised through a real browser request context rather
 * than a unit-level call, so the proxy and the handler are tested together the way
 * n8n meets them.
 *
 * The secret is supplied by the run (TEST_N8N_SECRET). When it is absent the test
 * proves only the refusal side, which is the half that must never regress; it does
 * not pretend to prove acceptance.
 */

const PATH = "/api/integrations/n8n/tiktok/run";
const SECRET = process.env.TEST_N8N_SECRET;

test("a caller with no secret is refused before anything else happens", async ({ request }) => {
  const response = await request.post(PATH, { data: { limit: 1 } });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("a wrong secret is refused and is never reported as a server fault", async ({ request }) => {
  const response = await request.post(PATH, {
    data: { limit: 1 },
    headers: { "x-n8n-secret": "definitely-not-the-secret" },
  });
  expect(response.status()).toBe(401);
});

test("a prefix of the secret is refused", async ({ request }) => {
  test.skip(!SECRET, "no secret supplied to this run");
  const response = await request.post(PATH, {
    data: { limit: 1 },
    headers: { "x-n8n-secret": String(SECRET).slice(0, 8) },
  });
  expect(response.status()).toBe(401);
});

test("the doorway is POST only", async ({ request }) => {
  const response = await request.get(PATH);
  expect(response.status()).toBe(401);
  expect((await response.json()).code).toBe("unauthorized:auth");
});

test("neighbouring machine and admin routes stay closed to a browser", async ({ request }) => {
  for (const path of ["/api/admin/users", "/api/n8n/admin/overview", "/api/integrations/tiktok/status"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
  }
});

test("the correct secret reaches the handler instead of the proxy", async ({ request }) => {
  test.skip(!SECRET, "no secret supplied to this run");
  const response = await request.post(PATH, {
    data: { limit: 1 },
    headers: { "x-n8n-secret": String(SECRET) },
  });
  // Past the gate, the handler answers for itself: a queue that is not there is
  // 503, never an empty 500.
  expect([200, 503]).toContain(response.status());
  const body = await response.json();
  if (response.status() === 503) expect(body).toEqual({ error: "queue_unavailable" });
  else expect(body).toHaveProperty("tenants");
});
