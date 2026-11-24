# n8n service contract (Core ↔ Social Publishing)

Owner of this file: ZOOKA Core. The route handler it describes belongs to Social Publishing.
Change either side only through a PR that updates both.

## The call

```
POST https://zooka-ai.com/api/integrations/n8n/tiktok/run
x-n8n-secret: <N8N_WEBHOOK_SECRET>
content-type: application/json

{"limit": 5}
```

`organizationId` is optional and normally omitted. With none supplied the server finds every tenant
that has due work and opens a separate tenant transaction per tenant, so the scheduler never holds a
tenant identifier and cannot be pointed at someone else's queue by editing it.

## Who authenticates what

| Layer | Responsibility |
|---|---|
| `proxy.ts` (Core) | Lets `POST` on this exact path through without a browser session, and nothing else. |
| Route handler (Social) | Compares `x-n8n-secret` in constant time. 401 on absent, wrong, or prefix-matching secrets. |
| Database (Social) | Row level security plus a per-tenant transaction; a token never leaves the server. |

The proxy exemption is a doorway for one machine caller, not a hole: `GET`/`PUT`/`DELETE` on the same
path, any sibling under `/api/integrations/n8n`, and every other API keep the session gate.

## Answers the scheduler must handle

| Status | Body | Meaning | What n8n should do |
|---|---|---|---|
| 200 | `{ drained: [...], tenants: n }` | Work processed | nothing |
| 400 | `{"error":"organizationId_malformed"}` | Bad payload | fix the workflow, do not retry |
| 401 | `{"error":"unauthorized"}` | Secret missing or wrong | fix the credential, do not retry |
| 429 | `{"error":"rate_limited"}` | Platform quota | wait `retryAfterMs`, job stays queued |
| 500 | `{"error":"n8n_webhook_secret_not_configured"}` | Server has no secret | owner action: set `N8N_WEBHOOK_SECRET` |
| 503 | `{"error":"queue_unavailable"}` | Database unreachable | retry with backoff; jobs are untouched |

A retry is always safe: claiming is atomic, a job is identified by `(organizationId, jobKey)`, and an
unknown publish outcome parks the job in `NEEDS_RECONCILIATION` instead of uploading twice.

## Known gap, Social side

The endpoint has **no rate limiting of its own**. The proxy cannot provide it (it runs per request at
the edge with no shared state), so a limiter belongs in the handler: a token bucket per
`x-n8n-secret` fingerprint, or a `lastRunAt` guard that refuses a second drain within the schedule
interval. Until that exists, a misconfigured n8n schedule can drain the queue faster than intended.

## Second call: Growth Engine report (read-only)

```
POST https://zooka-ai.com/api/integrations/n8n/growth/report
x-n8n-secret: <N8N_GROWTH_REPORT_SECRET>
content-type: application/json

{"days": 7}
```

A separate secret from the publishing call, so neither credential can do the other's job. The answer
is aggregate counts per signup channel (`channels`, `totals`, `bestChannel`, `notMeasured`) and never a
user identifier. `proxy.ts` only forwards `POST` on this exact path after validating the growth
secret. Missing configuration or an invalid secret is rejected at the proxy with `401`.

| Status | Body | What n8n should do |
|---|---|---|
| 200 | report | nothing |
| 400 | `body_malformed` / `days_out_of_range` | fix the workflow |
| 401 | `unauthorized` | fix the credential, do not retry |
| 503 | `report_unavailable` | retry with backoff |
