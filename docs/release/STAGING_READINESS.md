# Staging readiness

Measured on 2026-11-16. Every number here came from a command run in this working tree; nothing is carried
over from an earlier report. Where something was not executed, it says so.

- Branch: `feat/commander-tenant-scope` (Draft PR #95)
- Base commit at measurement: `ebc40c0`
- Repository: ZOOKA-AI/chatbot
- Database used: disposable local PostgreSQL 15.19 on `127.0.0.1:55432` (`zooka_mig_064`, `zooka_tenant`,
  `zooka_ws`). No production database was contacted, read or written.

## Quality gates

| Gate | Command | Pass 1 | Pass 2 |
| --- | --- | --- | --- |
| Full suite | `npx vitest run --no-file-parallelism` | 935 passed, 6 skipped, 941 total, 105 files | identical |
| Types | `npx tsc --noEmit` | exit 0 | exit 0 |
| Production build | `pnpm run build` | compiled, 151/151 pages | compiled, 151/151 pages |

The six skips are named, not hidden:

1. `execution-worker.test.ts > LIVE: reads the real authorised repository through the real tool` (needs `WORKER_LIVE`)
2. `domain-check-live.test.ts > a domain this project already owns reads as taken` (needs `ZOOKA_TEST_DOMAIN_LIVE`)
3. `domain-check-live.test.ts > a name nobody holds reads as available` (same gate)
4-6. `e2e-live.test.ts` three cases (task → scheduler → worker → live GitHub → evidence → history, and the chat
   and Vercel variants; need `E2E_LIVE` plus live credentials)

They are live external chains. They are skipped because no live credential exists, not because they are
expected to fail, and none of them was converted into a passing test.

## Migrations

18 pending pairs, `0028` through `0045`. Measured on a disposable clone built only from the repository's own
pre-pending migrations: 33 tables before, 46 after, so the set adds 13.

- Up: 18/18 applied, 33 → 46 tables
- Down: 18/18 rolled back, 46 → 34 tables
- Reapply: 18/18, back to 46 tables

**Correction to an earlier report in this document.** A previous revision said the rollback dropped five tables
"that existed in the drifted baseline" and gave the baseline as 39 tables. Both statements were wrong and are
retracted here. Each of the five tables is created by its own migration (`0029`, `0034`, `0035`, `0038`, `0039`)
and does not exist in the 33-table baseline, so dropping it on rollback is the correct inverse of creating it.
Measured: applying only `0000`–`0027` yields 33 tables and none of the five.

What is real, and now enforced, is the risk that a rollback drops rows written since the deploy. Every down file
that drops a table therefore carries a forward-only guard that refuses when rows exist.
- Row-level security enabled on 14 tables; 52 foreign keys present after the up pass
- Constraint proof: inserting an approval with `status = 'consumed'` and no approving actor is rejected by
  `StudioSpendApproval_approved_names_actor`

Three defects were found by rehearsing rather than by reading:

1. `0030` created policies without `DROP POLICY IF EXISTS`, so a second run aborted. Fixed; reapply now passes.
2. `0031`'s rollback revoked five tables, but later migrations grant the same runtime role on six more, so the
   assertion caught a rollback that left the request role able to read customer tables. Fixed by revoking
   across the schema.
3. `0031`'s rollback cannot drop a cluster-wide role when other databases reference it. It now names the
   databases and scopes its assertion to what this database can guarantee.

**Destructive rollbacks are now guarded, not merely documented.** Ten down files drop a table:
`EmailVerificationToken`, `AgentExecution`, `SchedulerRun`, `AgentSchedule`, `AgentLaunchPlan`, `AgentProject`,
`ProjectDocument`, `BrowserSession`/`BrowserEvidence`/`BrowserEvent`, `StudioAsset`, `StudioSpendApproval`.
Each raises `forward_only` when its table holds rows, and leaves the table and rows untouched. Verified by
execution: with one row present the rollback aborted and the row survived; with the table empty the drop
proceeded. `tests/unit/rollback-guards.test.ts` fails if any new down file drops a table without the guard.

## Providers

| Provider | Implemented | Configured | Authenticated | Real inference verified |
| --- | --- | --- | --- | --- |
| LOCAL (sharp, ffmpeg, rembg, piper) | yes | yes | not applicable | yes — a 1080x1920 artifact was produced and downloaded earlier in this remediation |
| SELF-HOSTED (ComfyUI) | yes | no endpoint | no | no |
| RunComfy cloud | yes | no token | no | no |
| fal.ai | yes | no key | no | no |
| Model provider (Groq, OpenAI-compatible) | yes | yes | **yes** — `/v1/models` returned 200 with 12 models | **yes** — one 161-token completion returned `ZOOKA`; free tier, no charge |

The model call also produced a real finding: at `max_tokens: 16` the reasoning model spent every token on
reasoning and returned empty content. The gateway refuses that as `empty_completion` instead of presenting it
as an answer.

No billable request was made to any image or video provider. No purchase, no top-up, no production call.

## Security

- ComfyUI outbound calls are guarded per redirect hop; cloud metadata addresses are refused unconditionally;
  a private-network worker requires an explicit acknowledgement and is refused in production. 11 tests.
- Financial approvals are a database row with ownership, provider, exact model, ceiling, expiry, single-use
  consumption, uniqueness and an uncertain-outcome state. 19 tests, including replay, concurrent attempts,
  expiry, above-ceiling and cross-workspace denial.
- Agent model invocation authorises before the network: unknown workspace agent and disabled agent are refused
  without a request, and a missing credential names itself. 16 tests.
- Tenant isolation on the Commander tables is enforced by RLS plus route-level scoping, verified on a real
  PostgreSQL cluster with a non-owner runtime role.
- **Agent tool policy (fixed 2026-11-16).** An agent's `allowedTools` was never loaded by the authentication
  query, so every authenticated agent arrived without a policy and the rule read that absence as "unrestricted":
  an allowlisted agent could run any tool, at the HTTP route and in the scheduler. Three collapses were closed:
  the missing column in `authenticateAgent`, `agentAllowsTool(null)` returning `true`, and the action runner
  coercing a missing policy to `null`. A stored `NULL` still means legacy-unrestricted and is reported as such;
  an absent, malformed or unreadable policy now permits nothing. Enforced twice: the HTTP route answers 403
  before any claim, and `runTask` re-checks the same policy itself so a task row inserted straight into the
  queue cannot bypass it. Verified over real HTTP against the built server (403 disallowed, 403 malformed
  policy, 200 allowed, 401 invalid key, `queue_empty` for another tenant while its owner saw and ran the same
  task) and by 7 regression tests including the queue-insertion path.

## Costs

Known: zero. Every provider call in this remediation was either local or on a free tier. Unknown until an
owner decision: RunComfy and fal.ai per-job pricing, which the gateway refuses to guess and requires as
configuration.

## Blockers

1. `RUNCOMFY_API_TOKEN` or `FAL_KEY` is not configured, so no cloud generation can run.
2. `PAID_GENERATION_ENABLED` is false, and no approval row for a real job exists yet.
3. The 18 pending migrations are unapplied in Preview and in Production.
4. Staging requires a separate database, which requires either a Neon free project or a Supabase slot; both
   need a credential the workspace does not hold.
5. `GEMINI_API_KEY`, `_2` and `_3` are all rejected by the provider (`API_KEY_INVALID`), so no independent
   architecture review has happened.
6. No v0 workspace access exists in this workspace, so the design work below is prepared, not performed.
