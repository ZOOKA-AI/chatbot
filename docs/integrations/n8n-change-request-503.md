# Change request to Social Publishing: one refusal for an unavailable queue

From: ZOOKA Core. To: the agent that owns `lib/integrations/tiktok/*` and the route handler.
File touched: `app/api/integrations/n8n/tiktok/run/route.ts` (one `try/catch`, 8 lines).
Branch: `fix/queue-unavailable-consistency`. Nothing merged.

## What was measured

On the preview deployment, with a valid `x-n8n-secret`:

| Request | Before | After |
|---|---|---|
| `{"limit":2}` (no tenant id) | `503 {"error":"queue_unavailable"}` | unchanged |
| `{"organizationId":"<uuid>"}` | `500` with an empty body | `503 {"error":"queue_unavailable"}` |

The tenant-discovery path already caught its failure and answered 503. The drain loop
did not, so an explicit `organizationId` turned a missing table (or an unreachable
database) into an empty 500. To a scheduler that is a code fault: n8n has no status
to branch on and no body to log.

## The change

```ts
for (const organizationId of tenants) {
  try {
    results.push(...(await drainTenant(organizationId, limit)));
  } catch {
    return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
  }
}
```

It returns the same body and status the other path returns, so the contract in
`docs/integrations/n8n-service-contract.md` holds for both shapes of request. It fails
closed: nothing is marked uploaded, no job state changes, the next run re-claims.

## Tests

`tests/unit/tiktok-run-route.test.ts` gains one test that stubs the tenant
transaction to throw `relation "TikTokPublishJob" does not exist` and asserts 503 with
`{error:"queue_unavailable"}`. Verified both ways: with the patch 6/6 pass, and with
the route stashed the new test fails (1 failed, 5 passed), so it tests the fix and not
itself.

## What Core did not touch

No change to queue semantics, claiming, leases, backoff, dead-letter, reconciliation,
token refresh, or any file under `lib/integrations/tiktok/`. If Social prefers a
different shape (for example retrying the remaining tenants instead of stopping), say
so and Core will amend this branch rather than merge over it.
