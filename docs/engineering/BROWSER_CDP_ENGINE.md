# Resumable browser engine — integration contract

The browser workspace needs an engine that hands back **the same tab** on a later
connection, because a Vercel function lives for one request. That is what
`BROWSER_CDP_URL` provides; token-based Browserless deliberately cannot, which is why the
panel answers `engine_not_resumable` instead of showing a stale frame.

## Environment contract

| Variable | Scope | Meaning |
| --- | --- | --- |
| `BROWSER_CDP_URL` | Preview only, then Production | `wss://` DevTools endpoint of a resumable Chromium |
| `BROWSERLESS_TOKEN` | Production only, currently invalid | legacy non-resumable fallback |
| `BROWSERBASE_API_KEY` / `_PROJECT_ID` | unset | managed alternative, resumable per session |

Engine priority in `lib/browser/remote.ts`: `BROWSER_CDP_URL` → Browserless → Browserbase.
Preview and Production must never share an endpoint, so a Preview test cannot drive a
Production browser.

## Requirement matrix

| Requirement | How it is met | Gap |
| --- | --- | --- |
| TLS | endpoint must be `wss://` behind a TLS proxy; never `ws://` | not enforced in code yet (value is used as given) |
| Authentication | bearer token in the query string or an `Authorization` header added by the proxy | not enforced in code yet |
| Private access | endpoint reachable only from Vercel egress: IP allowlist or Cloudflare Tunnel with a service token | deployment choice |
| Session persistence | one durable Chromium per workspace session, tab adopted on reconnect | done (`lib/browser/resume.ts`) |
| Tenant isolation | every session lookup is keyed by `organizationId` + owner; a foreign or spoofed id is `404` | verified on Preview |
| Separate engines | distinct variables per Vercel environment | configuration |
| Connection timeout | navigation/action timeouts exist; `connectOverCDP` itself is unbounded | **needs a `connect` timeout** |
| Automatic cleanup | `BrowserSession.expiresAt` drives `session_expired`; expired sessions are refused | no reaper for orphaned Chromium contexts |

## Deployment recipe (no purchase, no public CDP)

1. Small VM, Chromium launched with `--remote-debugging-port=9222` bound to `127.0.0.1`.
2. Reverse proxy on the same host terminating TLS and requiring a bearer token, exposing
   only `/devtools/**`.
3. Restrict inbound to Vercel egress ranges (or use a tunnel with a service token).
4. Repeat the host for Production with its own token; never reuse a URL across environments.
5. Set `BROWSER_CDP_URL` per environment and re-run the isolation and lifecycle suites.

Approximate running cost: one small VM, roughly $5 per month, or a managed resumable
provider in the tens of dollars per month. Nothing is purchased by this document.

## Queued code hardening (blocked behind a green gate run)

1. Validate `BROWSER_CDP_URL` at read time: accept only `wss://` (or `https://` mapped to
   `wss`), refuse `ws://`, loopback and link-local targets so a misconfigured value cannot
   become an SSRF primitive.
2. Add an explicit connect timeout to both `connectOverCDP` call sites; today a hung
   endpoint is bounded only by the platform's own function timeout.
3. Add a reaper that closes Chromium contexts whose `BrowserSession.expiresAt` has passed,
   so a crashed request cannot leak a browser.
