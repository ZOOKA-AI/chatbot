# Development coordination report

Date: 2026-11-16. One page, evidence-based. Anything not measured is labelled as not done.

## 1. Architecture as it stands

Next.js App Router on a single PostgreSQL database through Drizzle, deployed on Vercel.

- `lib/studio/gateway` — one provider interface over LOCAL, SELF-HOSTED (ComfyUI), RunComfy and fal.ai.
- `lib/studio/spend-approvals.ts` — the money gate: a database row decides, not a flag or a sentence.
- `lib/studio/outbound-guard.ts` — every provider call re-checked per redirect hop.
- `lib/agents/model-invocation.ts` — the worker's model call, authorised before the network.
- `lib/agents/worker-tools/*` — the deterministic tools a worker may run, allowlisted per agent.
- `lib/db/migrations/pending/0028`–`0045` — the schema the above needs.

## 2. Engineering completed in this directive

| Blocker | State | Evidence |
| --- | --- | --- |
| Financial approval security | done | 19 tests; replay, concurrency, expiry, ceiling, cross-workspace |
| Provider execution safety | done | 11 tests; metadata refused per hop, LAN needs acknowledgement |
| Migration readiness | done | 18/18 up, down, reapply on a disposable clone; 3 defects fixed |
| Real agent model invocation | done, provider authenticated | 16 tests; one real completion returned `ZOOKA` |
| Tenant isolation | done | RLS plus route scoping, verified on a real cluster |
| End-to-end acceptance | local only | deterministic artifact produced and downloaded; live chains still skipped |

## 3. v0 integration status: NOT ACCESSIBLE

There is no v0 workspace, token or project reference in this environment; a search of the environment and the
repository for v0 endpoints returns nothing. No design asset was inspected and no design was produced, because
claiming otherwise would be inventing work.

Access required: an invitation to the v0 team, or a v0 API token, plus the project id the designs belong to.

Prepared design tasks, ready to execute the moment access exists:

1. Arabic RTL audit of the studio and commander screens: logical properties instead of left/right, numeral
   handling, and line-height for Arabic type.
2. Mobile navigation: a single thumb-reachable primary action per screen, and a collapsed agent list that does
   not compete with the conversation.
3. Command Center: queue, approvals and execution history on one surface, each row carrying its real state.
4. Creative Studio: provider, model and estimated cost visible before the run button, not after.
5. Agent workspace: tool allowlist and model choice as one panel, refusing to save a combination that cannot run.
6. Integrations dashboard: per-connector state as connected, unconfigured or blocked, with no implied capability.

## 4. Gemini review status: NOT AUTHENTICATED

`GEMINI_API_KEY`, `GEMINI_API_KEY_2` and `GEMINI_API_KEY_3` are all present and all rejected by the provider with
`API_KEY_INVALID` on a free metadata call. No review was performed and no claim of review is made.

Structured review package prepared instead: `docs/release/STAGING_READINESS.md` (measured state),
`docs/release/ROLLBACK_PLAN.md` (migration risk), `docs/audits/ZOOKA_RELEASE_BLOCKERS.md` (blocker inventory), and
the test files named above as coverage evidence.

## 5. Blockers

B1 provider credential absent · B2 paid generation disabled by design · B3 migrations unapplied outside this
clone · B4 no staging database · B5 Gemini keys invalid · B6 no v0 access · B7 six live-chain tests skipped

## 6. Owner decisions required

Provider credential, paid-generation approval, staging database choice, migration approval, review access, and
merging PR #95. See `docs/release/OWNER_APPROVAL_CHECKLIST.md`.

## 7. Cost control

No subscription was purchased, no database duplicated, no paid inference run. The only external calls were two
free-tier model completions and two free provider metadata reads.
