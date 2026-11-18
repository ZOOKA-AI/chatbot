# The persistent browser: engine, gateway, application

This is how a browser session survives the worker that opened it, and what an operator has to deploy
for that to be true. Every claim below was measured; the measurements are listed at the end.

## Why the old design could not work

Playwright owns the browser contexts it creates: the context is a child of the CDP connection, so when
the connection dies the context is disposed. ZOOKA-AI runs on serverless functions, where a worker is
routinely recycled mid-session. That is why a session showed as "live" in the panel and then reported
`engine_not_resumable` a moment later.

Measured, not assumed: after killing the worker, `/json/list` on the engine returned one `about:blank`
target and the application's tab was gone.

## What replaced it

The context is created by Chromium, not by the client:

```
Target.createBrowserContext { disposeOnDetach: false }   // survives the connection
Target.createTarget { url, browserContextId }            // the tab
```

`lib/browser/persistent.ts` speaks CDP over the platform WebSocket (no `playwright-core`, no extra
dependency) and exposes exactly what the product needs: create a session, read its state (url, title,
cookies, localStorage), seed state, click, type, scroll, navigate, screenshot, dispose. Every one of
those takes a signed handle.

`lib/browser/cdp-adapter.ts` is the seam between the database and the engine. A `BrowserSession` row
holds two ids (migration `0058`: `browserContextId`, `targetId`). Nothing holds a connection. A request
mints a handle from those stored ids plus the workspace **on the row**, opens a short CDP connection,
does one thing, closes it. So worker death costs nothing: there is nothing to lose.

`lib/browser/sessions.ts` prefers this path whenever `BROWSER_CDP_URL` is set, and keeps the old
Playwright path as a fallback for environments without an engine.

### Why the handle is signed

A browser context id is a capability: whoever holds it can read that workspace's cookies. The handle is
HMAC-SHA256 over `browserContextId:targetId:organizationId`, keyed by `BROWSER_HANDLE_KEY`. The
workspace is inside the signed message, so a caller cannot promote itself by asserting a different
organization id; verification fails instead. `forbidden_workspace` is the honest answer, and it is the
one a cross-tenant test receives.

## The gateway: why the engine is never exposed

Chromium's DevTools endpoint is total authority over every context on the host. It stays on loopback.
`gateway/cdp-gateway.mjs` is the only door:

| Control | Behaviour |
| --- | --- |
| Authentication | one bearer token per workspace, compared with `timingSafeEqual` |
| Authorization | a workspace only reaches the engine with its own token |
| Capacity | `GATEWAY_MAX_CONNS` total, `GATEWAY_MAX_PER_TENANT` per workspace |
| Rate limit | `GATEWAY_RATE_LIMIT_PER_MIN` upgrade attempts per workspace per minute |
| Idle | a connection with no traffic for `GATEWAY_IDLE_MS` is closed |
| Logging | tenant, event and reason only; tokens and query strings redacted; no CDP payload ever |
| TLS | not terminated here: the process refuses a non-loopback bind unless explicitly overridden, so a tunnel terminates TLS in front of it |
| Failure | a dead engine is a fast `502`, not a hang |

## Deployment shape

```
Vercel (preview/production)
   │  wss://browser.example.com/cdp?tenant=<workspace>&token=<token>
   ▼
Cloudflare Tunnel  ── TLS terminated, no inbound ports on the host
   ▼
127.0.0.1:8787  cdp-gateway.mjs      (GATEWAY_TENANTS = per-workspace tokens)
   ▼
127.0.0.1:9222  Chromium --headless=new --remote-debugging-address=127.0.0.1
```

Environment on Vercel:

- `BROWSER_CDP_URL` — the `wss://` gateway URL for the workspace. A secret: it carries the token.
- `BROWSER_HANDLE_KEY` — handle signing key, at least 32 random bytes. Never in Git, never in a row.

Environment on the engine host: see `deploy/oracle/environment.template`.

## Operating rules

- The engine is a shared resource. A session that nobody comes back for is a leak, so contexts are
  disposed on stop, on expiry, and by `expireIdleSessions`.
- Never store `BROWSER_CDP_URL` in `BrowserSession`. It can carry a token, and a session row must never
  become a credential store.
- A session whose ids are `NULL` is not resumable. That is the honest state for pre-0058 rows, and the
  application says so rather than pretending.

## Measurements

| Claim | Result |
| --- | --- |
| Context and tab survive worker death | 16/16 assertions, four separate OS processes |
| Cookie, localStorage, url, title preserved | passed, same context and tab ids |
| Real mouse click on the adopted tab | counter incremented 0 → 1 |
| Screenshot of the adopted tab | valid PNG, 6,951 bytes |
| Second workspace cannot read tenant A's handle | `forbidden_workspace` in read and in forged handle |
| Gateway refuses a wrong token | no upgrade |
| Gateway refuses a token without a tenant | no upgrade |
| Per-workspace connection cap | third connection refused |
| Idle connection reclaimed | closed after the configured idle window |
| Access log free of tokens, cookies, query strings | passed |
| Dead engine fails fast | refused, no hang |
| Application code path end to end (`createSession` → `controlSession` → `applyInput` → frame → `expireSession`) on a real database and real Chromium | 4/4 tests |
| Cross-workspace `applyInput` | refused (`session_not_found`/`not_session_owner`) |
| Expiry disposes the browser-side context | state read fails after expiry |
| Migration 0058 rollback on an isolated clone | columns and index dropped, 3 seeded rows and their data intact, re-applied cleanly |
