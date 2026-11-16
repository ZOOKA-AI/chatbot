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
| Local deterministic studio — media produced | **VERIFIED_WORKING** (local) | real artefacts: `promo-film.mp4` h264 1080×1920 + aac, 7.47 s, 280,179 B; `promo-poster.png` 107,722 B |
| Local deterministic studio — result delivered to the right project | **VERIFIED_PARTIAL** | 7/13 customer-path checks; artefact stored under a different project (B9); download 500 |
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


## 12. The real customer path, executed rather than reasoned about

The only execution that needs no third party is the local studio. I ran it at this head against a real
server, a real signed-in owner, a real project and a real agent key:

```
node scripts/acceptance/provision-studio-agent.mjs      # creates project + agent holding studio tools
ACCEPT_PROJECT=<uuid> ACCEPT_AGENT_KEY=<zk_…> node scripts/acceptance/studio-agent-path.mjs
```

**Result: 7 of 13 checks passed.** The first run showed 4/13 because I had not supplied those two
variables; that run is invalid and is not used as evidence. The valid run:

| Check | Result |
|---|---|
| an Arabic request queues a real task | PASS, 201, task `1e2cd64d-5eba-46a0-8262-c71417cc1240` |
| the agent executes the studio tool with its own key | PASS, 200, "Edited … The result is 1080×1920" |
| an unassigned studio tool is refused | PASS, 409 `no_assigned_agent` |
| local decisions (edit, cutout, render, audio) | PASS |
| generation refused with named reasons | PASS, `not_configured`, `paid_provider_not_enabled` |
| paid engines off with no approval cited | PASS |
| the run reports the asset it produced | **FAIL** |
| the produced asset is in the workspace library | **FAIL**, missing |
| the size the customer asked for | **FAIL**, `undefined×undefined` |
| the result names the original it came from | **FAIL**, none |
| the agent's output downloads as real bytes | **FAIL**, HTTP 500 |
| self-sufficient without a GPU | **FAIL**, `["narration"]` only |

### 12.1 A project-binding defect, found by this run

The task executed and produced a real 1080×1920 PNG at 08:06:54. Its row in `StudioAsset` says:

```
id=dde8a480-…  projectId=67728637-9421-4a31-9f08-17ed93f692da  width=1080 height=1920 label=edit:resize
```

The action was queued for project `65f9fa75-f334-4c7c-9024-cfc688813090`. **The artefact was stored under a
different project of the same workspace.** That is why the library list and the size lookup and the download
all fail in the acceptance: the work exists, under the wrong owner.

This is exactly the class of defect that tenant-level isolation tests cannot catch, because both projects
belong to the same tenant. It is recorded as **B9**, severity high: work can land in the wrong customer
project within a workspace.

### 12.2 What this changes in the verdict

It does not change the verdict (still NO) but it sharpens it: the local studio is not merely "not deployed",
it is **VERIFIED_PARTIAL** — it executes and produces correct media, and then attaches the result to the
wrong project, which breaks retrieval. The deterministic claim in C-17 stands for the media itself (ffprobe
evidence) and is corrected here for the delivery path.

### 12.3 Narration

`["narration"]` is the only capability the self-sufficiency check reports, meaning the local narration path
was not offered in this environment (Piper binary absent). The code path exists; the runtime dependency did
not. Marked environment-dependent, not a code defect, and not counted as passing.

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

---

## 13. Addendum, 16 November 2026 12:5x Dubai — B9 and B10 closed

The findings in §§12.1 and 12.2 are kept as written, because an audit that edits its own findings afterwards
is worth nothing. This addendum records what changed, with the commit that changed it.

Implementation commit: **`ebc40c0`** on `feat/commander-tenant-scope` (Draft PR #95). The audit branch stayed
documentation only, as Directive #061 §14 requires.

| Defect | Root cause | Fix | Evidence |
|---|---|---|---|
| B9, artefact under the wrong project | every studio tool stored through `projectId: source.projectId`, so the result inherited the source asset's project | the task payload's project is passed by every tool and preferred by the media layer | the new asset row carries `a5ed6682…`, the project that was asked for; the library lists it; the success run asserts it |
| B10, download 500 | `POST /api/agents/worker` returned the summary but not the tool's `evidence`, so the caller had no asset id and requested `/assets/null/file` | the worker returns `evidence` with its answer | download 200, 91,591 bytes, recorded mime type |

**The customer path, re-run at `ebc40c0` after the fix: 13/13.**

```
PASS an Arabic request queues a real task — 201 20fe5f1f-…
PASS the agent executes the studio tool — 200 Edited "edit:resize" … 1080×1920
PASS the run reports the asset it produced
PASS the produced asset is in the workspace library — image 1080×1920
PASS the agent's edit used the size the customer asked for — 1080×1920
PASS the result names the original it came from — 50a32f01-…
PASS the agent's output downloads as real bytes — 200 91591 bytes
PASS an unassigned studio tool is refused, not silently run — 409 no_assigned_agent
PASS editing, cutouts, rendering and audio are decided locally
PASS generation is refused with named reasons, not faked
PASS the platform reports itself self-sufficient without a GPU — []
PASS paid engines are off with no approval cited
```

The last check was failing at `8cfb747` for an environment reason, not a code reason: `STUDIO_PIPER_VOICE`
was not set, so the narration engine reported a gap. With the voice configured the engine set is complete and
no GPU is needed. That distinction is recorded rather than blurred: the code was already right, the deployment
was not configured.

Gates at `ebc40c0`: 890 passed / 6 skipped / 896 in 102 files, twice, identical; `tsc` clean; `next build` 0.

**What this does not change.** The verdict stays NO. The customer path now works completely *in this
workspace*, against a local server. It still does not exist in production (`main` has none of it), still has
no provider credential, and still needs 17 pending migrations. B1, B2, B4, B5, B6, B7 and B8 are untouched.

---

## Appendix A — 2026-11-16, remediation evidence (appended, original findings unedited)

This appendix does not revise any finding above. It records what was fixed and what remains true.

**Findings above that were reproduced and then fixed**

- "The approval is free text with no expiry, no single consumption and no idempotency" — replaced by
  `StudioSpendApproval` (migration `0045`): ownership, provider, model, capability, ceiling, expiry, status
  machine `pending → approved → consumed`, unique `idempotencyKey`, and `uncertain` for an unread provider
  outcome. Consumption is a conditional update, so two simultaneous submissions produce one job. 19 tests.
- "The execution worker never calls a model" — `lib/agents/model-invocation.ts` now does, and refuses before the
  network when the workspace, agent status, model or credential does not allow it. 16 tests with a stubbed
  transport. One real completion on a free tier returned `ZOOKA`; that is stated separately from the stubbed
  path rather than folded into it.
- "ComfyUI is called without an outbound guard" — every hop is re-checked, cloud metadata is refused
  unconditionally, and a LAN worker needs an explicit acknowledgement. 11 tests, including a redirect to
  `169.254.169.254` that is refused before the request is made.
- "34 migration files pending, 17 pairs" — now 18 pairs (`0028`–`0045`), rehearsed as 18/18 up, down and
  reapply on a disposable clone. Three defects were found by the rehearsal: `0030` was not re-runnable,
  `0031`'s rollback left grants on six tables, and its role drop failed on a cluster-wide role.

**Findings above that remain true**

- RunComfy and fal.ai are implemented and unconfigured. No credential exists; no cloud job has run.
- The migrations are unapplied outside a disposable local database. Preview and Production are untouched.
- No staging environment exists: a separate database needs a credential the workspace does not hold.
- Six live-chain tests are still skipped by environment gate (1 worker, 2 domain, 3 end-to-end). None was
  converted into a pass.
- Production still carries no file from this branch.

**New findings from this pass**

- The model provider authenticates (12 models) but serves none of the gateway registry ids. A provider
  catalogue was added from the provider's own `/models` response; without it every direct call would have been
  refused as `model_not_allowed`.
- At `max_tokens: 16` the reasoning model returns empty content because every token goes to reasoning. The
  gateway refuses that as `empty_completion` instead of showing an empty answer to a customer.
- Rolling back `0029`, `0034`, `0035`, `0038` and `0039` drops five tables and their rows. This is documented in
  `docs/release/ROLLBACK_PLAN.md` rather than discovered during a release.

**Gate evidence at this appendix's date:** 935 passed / 6 skipped / 941 total across 105 files, twice,
identical; `tsc --noEmit` exit 0 twice; `pnpm run build` successful twice.

## Appendix B — 2026-11-16, the allowlist defect (findings above unchanged)

Nothing earlier in this document is retracted or edited. This appendix records a defect that the earlier audit
missed and that was found by probing the built server rather than reading the code.

**The claim that did not hold.** The earlier appendices reported the agent tool policy as enforced, on the
strength of `agentAllowsTool` and its unit tests. Enforcement was not in force. `authenticateAgent` never
selected `allowedTools`, so at runtime every agent had no policy, and the rule treated "no policy" as
"unrestricted". The unit tests passed because they constructed their own objects instead of asking the
authentication query what it returns. This is the same class of error the audit was written to catch: a passing
test standing in for a working path.

**Severity.** An agent the owner had restricted to a single read tool could execute any registered tool,
including write and network tools, through the HTTP worker route and the scheduler. No credential crossed a
tenant boundary, and no cross-tenant read was possible, but the per-agent permission boundary did not exist.

**Evidence after the fix** (real PostgreSQL 15.19, built server, real HTTP):

- `403 tool_not_assigned` for a tool the agent does not hold;
- `403` for a malformed stored policy;
- `200` for a tool it does hold;
- `401` for an unknown key;
- another tenant received `queue_empty` while the owner of the queued task executed it in the same second;
- a task row inserted directly into the queue is refused when `runTask` re-checks the policy.

**Gates.** 984 passed / 0 failed / 6 skipped, twice, identical; `tsc` exit 0 twice; production build exit 0
twice. Two of my own earlier verification runs were invalid and are recorded as such: one reported 43 failures
after the local database cluster died mid-run, another reported 6 failures because the health suite was pointed
at the shared database instead of its own. Neither number is a result about the code.

**Still open.** No Production change; no migration applied; PR #95 Draft and unmerged; the GitHub token that
sat in the local remote URL is removed from the working copy but not yet rotated, which remains an owner action.
