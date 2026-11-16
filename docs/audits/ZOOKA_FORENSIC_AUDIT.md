# ZOOKA-AI — Independent Forensic Audit (Directives #059, #060, #061 §12)

Audited commit: `8cfb747467f0018d06211b0de8f64725a6e04341` (branch `feat/commander-tenant-scope`, Draft PR #95)
Ledger commit: `dccaf0babc59b1f5bc6a24cfbff4df7f11868840` (Draft PR #92)
Production reference: `main = 19473c0d30`
Audit date: 16 November 2026, Dubai.
Auditor: the same agent whose claims are audited. That is the weakness of this document and it is stated up
front: the reproduction steps are written so that any third party can run them and get the same output, and
where I could not verify something I say so rather than rounding it up.

## 1. Baseline, captured before touching anything

| Item | Command | Result |
|---|---|---|
| Uncommitted files | `git status --porcelain` | 0 |
| Stashes | `git stash list` | 0 |
| HEAD | `git log --oneline -3` | `8cfb747`, `6ad10a5`, `2d852ad` |
| Branch | `git rev-parse --abbrev-ref HEAD` | `feat/commander-tenant-scope` |
| Draft PR #95 | GitHub API `pulls/95` | open, draft, head `8cfb747`, base `main`, 323 files, +42211/−440, mergeable true |
| Draft PR #92 | GitHub API `pulls/92` | open, draft, head `dccaf0b`, 9 files, +1499/−0 |
| Production `main` | `git/refs/heads/main` | `19473c0d30` |

Nothing was uncommitted, so nothing could be lost. Development was frozen here and every step below is
read-only or a test run.

## 2. Method

Every number in this document comes from a command run in this workspace on this commit:

```bash
# gates, twice, identical environment
export ZOOKA_TEST_PG_ADMIN=… ZOOKA_TEST_PG_RUNTIME=… ZOOKA_TEST_PG_HEALTH_ADMIN=… \
       ZOOKA_TEST_PG_HEALTH_RUNTIME=… ZOOKA_TEST_PG_REPO_DB=…
npx vitest run --no-file-parallelism     # Gate A, then Gate B
npx tsc --noEmit
# what actually skips
npx vitest run tests/unit/e2e-live.test.ts tests/unit/domain-check-live.test.ts --reporter=verbose
# paid-path reachability
grep -rn '\.submit(' --include=*.ts lib app components
# deployment reality
curl -s -o /dev/null -w '%{http_code}' https://zooka-ai.com/api/studio/zzz-definitely-not-a-route
curl -H "Authorization: token …" https://api.github.com/repos/ZOOKA-AI/chatbot/contents/lib/studio/gateway?ref=main
# artefact genuineness
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height acceptance/promo-film.mp4
```

## 3. Reproduced test evidence

| Gate | Files | Tests | Result |
|---|---|---|---|
| Gate A | 102 (100 passed, 2 skipped) | 896 | **890 passed, 6 skipped** |
| Gate B | 102 (100 passed, 2 skipped) | 896 | **890 passed, 6 skipped** |
| TypeScript | — | — | `tsc --noEmit` exit 0 |
| Isolation suites alone | 3 | 30 | 30 passed |

The two runs were separate invocations with the same environment and produced identical numbers, so the
"ran twice" claim holds.

**The six skips, named.** They are not hidden failures and they are not harmless either:

| File | Test | Gate condition |
|---|---|---|
| `tests/unit/e2e-live.test.ts` | task → scheduler → worker → live GitHub → evidence → history | `E2E_LIVE=1` |
| `tests/unit/e2e-live.test.ts` | a chat command becomes real work and a verified result | `E2E_LIVE=1` |
| `tests/unit/e2e-live.test.ts` | the same chain reads the workspace's Vercel deployments | `E2E_LIVE=1` |
| `tests/unit/domain-check-live.test.ts` | a domain this project already owns reads as taken | `ZOOKA_TEST_DOMAIN_LIVE=1` |
| `tests/unit/domain-check-live.test.ts` | a name nobody holds reads as available | `ZOOKA_TEST_DOMAIN_LIVE=1` |
| `tests/unit/execution-worker.test.ts` | live worker claim (single test) | `WORKER_LIVE=1` |

Consequence stated plainly: **the live end-to-end chain (queue → worker → real GitHub/Vercel → evidence) is
never executed in the quality gate.** It requires real external credentials and outbound calls, so the gate
proves the code paths with fakes, not the live chain. Any claim of "end to end verified" rests on earlier
one-off runs, not on the gate.

## 4. Feature-by-feature truth matrix

| Feature | Classification | Evidence |
|---|---|---|
| Local deterministic studio (edit, cutout, narration, render, promo film) | **VERIFIED_WORKING** (local) | real artefacts: `promo-film.mp4` h264 1080×1920 + aac, 7.47 s, 280,179 B; `promo-poster.png` 107,722 B |
| Studio action catalogue + queue integration | **VERIFIED_WORKING** (local) | `studio_ai_generate` in `INTERNAL_WRITE_TOOLS`; single submit caller |
| Router: capability → model → credential → health → cost → budget → tier → preference | **VERIFIED** | 14/14 `ai-gateway-router.test.ts` |
| No silent model substitution | **VERIFIED** | `requested_model_not_offered`, empty order; dearer requested model chosen verbatim |
| Unknown price refused, never zero | **VERIFIED** | `cost_unknown` case |
| Budget and run-limit refusal | **VERIFIED** | `over_budget:*`, `run_limit_exceeded:*` |
| RunComfy adapter (discovery, submit, poll, result+cost, cancel, balance) | **MOCK_ONLY** | 8/8 lifecycle fixtures; 0 real calls |
| fal adapter (queue submit, poll, result, cancel, no submit retry, redaction) | **MOCK_ONLY** | 15/15 adapter cases; 0 real calls |
| ComfyUI self-hosted client | **VERIFIED_PARTIAL** | `/prompt`, `/history/<id>`, `/view`, timeouts present; **no cancel**, **no private-network/metadata guard** (only `^https?://`) |
| ComfyUI via gateway | **CODE_ONLY** | `executable:false`, readiness `endpoint_missing` |
| Provider credentials | **BLOCKED** | no `RUNCOMFY_API_TOKEN`, no `FAL_KEY` in any environment used |
| Real AI generation | **BLOCKED** | READY_FOR_OWNER_APPROVAL; zero submits |
| Per-job financial approval | **VERIFIED_PARTIAL** | string reference only: no AgentApproval row, no expiry, no single-use consumption, no idempotency key |
| Tenant isolation, database | **VERIFIED_PARTIAL** | RLS suites pass under `zooka_runtime`; production DB **NOT_ACCESSIBLE** |
| Tenant isolation, storage | **VERIFIED** | `store()` requires `organizationId`, writes to a per-tenant directory |
| Tenant isolation, approvals | **GAP** | studio approval is not tenant-bound (see §6.2) |
| Agent worker execution | **CODE_ONLY for AI** | no `generateText`/`streamText`/SDK call in `lib/agents`; only credential-presence checks. Tools are deterministic |
| Chat model loop | **VERIFIED_WORKING** (local, historical) | `streamText` in `app/(chat)/api/chat/route.ts`, `lib/ai/tracing.ts` |
| Browser runtime | **CODE_PLUS_TESTS** | `lib/browser/{runtime,sessions,url-policy}.ts`, real `chromium.launch`; tests green in gate; no live site run in this audit |
| Gateway status API (`/api/studio/gateway`) | **VERIFIED_WORKING** (local build only) | 200 for owner against local server |
| Production deployment of any of the above | **NOT_DEPLOYED** | `main` has no `lib/studio/gateway`, no `lib/studio/runcomfy.ts`, no `studio-ai-generate.ts` (404) |
| Production database state | **NOT_ACCESSIBLE** | port 5432 blocked; no production credential held |
| Migrations 0036–0044 | **BLOCKED** | 34 pending SQL files (17 up/down pairs) vs 28 applied on `main` |

## 5. Provider connectivity findings

| Provider | Readiness code | What that means |
|---|---|---|
| `local-engines` | `ready` | ffmpeg/rembg/Piper on our own CPU, proven by artefacts |
| `comfyui` | `endpoint_missing` | no `COMFYUI_ENDPOINT`; even with one, gateway marks it `not_executable` because the real client is elsewhere |
| `runcomfy-cloud` | `credential_missing` | adapter complete, connection never established |
| `fal-cloud` | `credential_missing` | adapter complete; also `credential_unverified` semantics: a key's presence is not proof it authenticates, and fal documents no free catalogue call |

**No provider call has ever succeeded. There is no evidence of connectivity, only evidence of code.**

## 6. Security findings

### 6.1 Paid inference has exactly one entry point — confirmed, not assumed
`grep -rn '\.submit(' --include=*.ts lib app components` returns one result:
`lib/agents/worker-tools/studio-ai-generate.ts:154`. That call is reachable only after `routeGeneration()`
(refuses on missing credential, missing switch, missing approval, unknown cost, over budget) and then
`decideSpend()` (refuses on operator switch, approval, unknown estimate, cap, run limit, balance). The
transport functions `submitRequest` and `submitFal` are imported only by the adapters inside
`lib/studio/gateway/`, and no route or component imports them. **Claim C-12 holds.**

### 6.2 The approval is a string, not a record — real gap
`approvalReference` is validated for non-emptiness and nothing else. Consequences:
- it can be reused for unlimited jobs;
- it never expires;
- it is not bound to tenant, user, project, provider, model or amount;
- there is no idempotency key, so two concurrent actions with the same reference both pass.

`lib/agents/approvals.ts` and the `AgentApproval`/`AgentDecision` tables do exist with atomic decisions, but
the studio spend path does not use them. Directive #061 §7 is therefore **not met**.

### 6.3 ComfyUI endpoint validation is weaker than required
`comfyEndpoint()` accepts any `http(s)` string. There is no block on `127.0.0.0/8`, `10/8`, `172.16/12`,
`192.168/16`, link-local `169.254.169.254`, or IPv6 equivalents. An owner who mistypes an endpoint, or a
tenant who can influence `COMFYUI_ENDPOINT`, could point the adapter at internal infrastructure. There is no
cancel either (`/interrupt` is absent), so a runaway job cannot be stopped from our side.

### 6.4 A prior security assertion of mine was weak, and is corrected
I reported "unauthenticated caller is refused at the route — 307" as evidence that the gateway route is
guarded. The control experiment shows `/api/studio/zzz-definitely-not-a-route` also returns 307. **307 is
proxy behaviour for any unknown protected path and proves nothing about a route's existence or its guard.**
The meaningful evidence is different and I state it as such: the route returns 200 JSON for an owner session
and the gateway's own code calls `unauthorized()` for non-owner callers; that is a code-level guarantee, not
a probe-level one.

### 6.5 Secrets
No secret value appears in any audit output. Credential names only. `PAID_GENERATION_ENABLED` is unset in
every environment used, which the code treats as off.

## 7. Contradictions between previous reports and the code

| Previous statement | What the record shows |
|---|---|
| "Live integration checks 11/11" | True, but against a **local** `next start`, not production. Production has none of these routes |
| "RunComfy lifecycle 8/8" | True as fixtures; **zero** real provider interactions |
| "fal.ai and RunComfy connected" | False. No credential exists; the word I used, "wired", was accurate and "connected" was not |
| "Full test gates 861 passed" | True at `6ad10a5`; current head is 890. Both reproduced |
| "Production healthy" | Pages serve 200, but production runs `main` without the gateway. Healthy is not the same as compatible |
| "Per-job approval enforced" | Enforced as a non-empty string, not as a durable consumable approval |

## 8. Production findings

- `GET /` 200, `GET /login` 200, `GET /api/auth/providers` 200: the site is up.
- `main = 19473c0d30`. Contents API returns **404** for `lib/studio/gateway`, `lib/studio/runcomfy.ts` and
  `lib/agents/worker-tools/studio-ai-generate.ts` on `main`. The gateway, RunComfy and the studio AI action
  are **not deployed and cannot be** until PR #95 is merged and deployed.
- Production database: **NOT_ACCESSIBLE**. Port 5432 is blocked from this sandbox and I hold no production
  credential. Any statement about production row counts or migration journal state from here would be
  invention.
- Migrations: 34 pending SQL files against 28 applied on `main`. Deploying PR #95 without them would produce
  the class of drift already measured earlier (`User.name`, `Organization.slug`, `Chat.deletedAt`,
  `Document.embedding`).

## 9. Financial exposure

| Item | State |
|---|---|
| Paid inference submitted | **0**, ever |
| RunComfy wallet | $0.50, automatic top-up off |
| Deployment or GPU purchased | none |
| Operator switch | off in every environment used |
| Cost of this audit | zero (local Postgres, local builds) |

## 10. Timeline of this workstream

| Milestone | Head | Substance |
|---|---|---|
| 014 | `1ed8f8a` | studio tools, ComfyUI client, 40/40 local artefact acceptance |
| 016 | `2d852ad` | one Arabic sentence → finished promo film (deterministic) |
| 017 | `6ad10a5` | RunComfy v2 adapter, spend gate, refusals by default |
| 018 | `8cfb747` | gateway over four providers, fal adapter, router, panel |

## 11. Verdict

**Can a new customer register and successfully complete a real AI task today without developer
intervention? NO.**

Reproducible reasons, in order of force:

1. Production does not contain the feature. `main = 19473c0d30`; the gateway files 404 on `main`; PR #95 is
   an unmerged draft (C-18).
2. Even in the development tree, no paid provider can answer: `RUNCOMFY_API_TOKEN` and `FAL_KEY` are absent,
   so every cloud path returns `credential_missing` before any network call (C-11).
3. The migrations the code depends on are unapplied: 34 pending SQL files, and applying them is forbidden in
   this directive (C-20).
4. There is no ComfyUI endpoint, so the free self-hosted route has nothing to talk to (C-21).
5. The only path that does work without any third party is the deterministic local studio, which is not an
   AI model and does not need a customer's approval to be true or false — it is real, and it is not what the
   directive asks for.

What a customer *can* do today without a developer: register, log in, read pages, use the chat model, and
create deterministic studio artefacts in a self-hosted deployment. What they cannot do is generate an image
with an AI model from a cloud provider, because the product has no credential and no deployment to do it in.
