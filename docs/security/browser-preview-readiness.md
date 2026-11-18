# Browser workspace — Preview readiness evidence (PR #120)

Measured 2026-11-18 on branch `feat/browser-live-tab-adoption`, head `e1716ef`
(Vercel deployment `dpl_HWDD1d9B`, state **READY**, `chatbot-h6p5xpg9l-zooka-ai1.vercel.app`).
Production was not touched: `main` stayed at `9686c42`, no Production env var and no Production
secret was changed, and nothing was merged.

## 1. Preview database is isolated (not Production)

| Signal | Preview (Neon `ep-dawn-field-b3i5rtwl`) | Production (Supabase) |
| --- | --- | --- |
| Users | 9 | 279 |
| Organizations | 18 | 279 |
| Tables with RLS | 47 of 47 | 72 of 72 |
| Browser sessions | seeded test rows only | live customer rows |

`chatbot` already carries 21 preview-scoped variables, including `DATABASE_URL`,
`DATABASE_URL_TENANT`, `DATABASE_URL_SERVICE`, `DATABASE_URL_PLATFORM`,
`TENANT_RLS_ENABLED` and its own `AUTH_SECRET`. The earlier "Preview has no database
configuration" finding is stale and no longer true.

## 2. Authenticated journey on Preview (disposable accounts)

Two throwaway accounts and two separate workspaces were created **inside the isolated
Preview database** (`browser.qa.a@zooka-preview.test`, `browser.qa.b@zooka-preview.test`).
Logging in with them proves the deployment really reads that database, because the
accounts exist nowhere else.

| Step | Tenant A | Tenant B |
| --- | --- | --- |
| `GET /api/auth/csrf` | 200 | 200 |
| `POST /api/auth/callback/credentials` | 200 | 200 |
| `GET /workspace/browser` (authenticated) | 200 | 200 |
| `POST /api/workspace/browser/sessions` | 201 + real session id | 201 |

## 3. Session isolation (all measured on Preview)

| Attack / probe | Result |
| --- | --- |
| Tenant B reads A's frame | 404 |
| Tenant B sends `take_over` to A's session | 404 `session_not_found` |
| Tenant B sends input (navigate) to A's session | 404 |
| Tenant B lists sessions | 0 (cannot see A's) |
| Random (spoofed) session id, frame | 404 |
| Random (spoofed) session id, control | 404 |
| Expired session control (`expiresAt` moved 2h into the past) | 409 `session_expired`, state `expired` |
| 6 concurrent `take_over` calls on one session | all 409 `runtime_unavailable`, no session duplicated |

Tenant scoping happens in the query (`organizationId` + owner), so a foreign id is
indistinguishable from a missing id: no existence leak.

## 4. Lifecycle on Preview today

`start` → 409 `runtime_unavailable`; `frame` → 409 `no_live_browser` with
`reason: engine_not_resumable`. This is correct and deliberate: the panel refuses to
show a stale or fake frame when the engine cannot hand back the same tab. Start,
navigate, click, type, scroll, screenshot, takeover and resume cannot run on Preview
until a resumable engine exists (see §5). They were verified on real Chromium in the
local harness earlier on this branch (navigate → read → screenshot → scroll in one
session, 13/13 browser tests).

## 5. Exact infrastructure requirement

One env var per environment: `BROWSER_CDP_URL` pointing at a **resumable** Chromium that
keeps a tab alive across connections. Token-based CDP (Browserless) is *not* resumable
and produces `engine_not_resumable` by design.

- No public CDP endpoint: terminate TLS in front of it and require a bearer token, or
  reach it over a private network/VPN.
- Preview and Production must use different endpoints so a Preview test can never drive
  a Production browser.
- Operating cost, approximate and to be confirmed at purchase: self-hosted Chromium on
  the smallest VPS ≈ $5/month; managed Browserbase class plans ≈ $39/month. Browserless
  free tiers exist but are not resumable. Nothing here is committed spend.

## 6. Rollout and rollback

1. Provision the endpoint, set `BROWSER_CDP_URL` on **Preview only**.
2. Re-run this suite: expect `start` 200, real frames, evidence rows, recovery across
   two processes.
3. Merge PR #120 after the owner gates pass. Then set `BROWSER_CDP_URL` on Production.
4. Rollback: remove `BROWSER_CDP_URL`. The app returns to `engine_not_resumable`
   immediately; no schema change, no data migration, no secret rotation involved.

## 7. Gate status

| Gate | Where | Result |
| --- | --- | --- |
| TypeScript + production build | Vercel build of `e1716ef` | READY (build includes type checking) |
| Unit + browser tests | local harness, earlier on this branch | 13/13 browser tests, suite green |
| Re-run of tsc/tests on this commit | sandbox | **not possible**: the sandbox restarted, dependencies are gone and the disk is 97% full |

## 8. Known configuration risk

`chatbot` has one Vercel protection-bypass entry for Preview. Its value was surfaced in
an audit log during this work, so it should be treated as exposed: delete and re-add it
in Vercel → Settings → Deployment Protection (the Vercel API rejects `protectionBypass`
in PATCH, so this is a dashboard action). Preview hosts no customer data, and the bypass
does not apply to Production.
