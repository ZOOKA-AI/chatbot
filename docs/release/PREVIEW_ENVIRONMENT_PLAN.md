# Isolated Preview environment: audit and preparation

Measured 2026-11-16 against the live Vercel project and the agent's records. Nothing was created, deployed,
migrated or changed in this pass. The last section lists the decisions that need the owner before anything is.

## 1. What exists today

| Resource | State | Usable for Preview? |
| --- | --- | --- |
| Vercel team `zooka-ai1`, project `chatbot` (`prj_xj5j7HhhjGjvXU1qzA7aoXQNLW0p`) | Pro plan, already paid, 45 env vars | Yes, no new cost |
| Supabase org `Royal Cleaning & Sterilization` | Free plan, one active project `krzfrsaquvmwctsajhlm` = Production | **No.** The free allowance is two active projects per user and it is consumed; the second project (`bylfizytgayoefuyliix`, Ireland) belongs to another account |
| Neon | No account, no API key anywhere in the secret store | Would be the cheapest path, needs creation |
| Second free Supabase account | Does not exist | Possible, needs a second email |
| Local PostgreSQL 15.19 on `127.0.0.1:55432` (`zooka_tenant`, `zooka_health`, `zooka_ws`, `zooka_mig_069b`, `zooka_ui`) | Real, disposable, used by the 984-test gate | **No.** A Vercel function cannot reach this sandbox. It stays useful for local acceptance and for rehearsing the migration ladder |

## 2. The actual finding

**Preview has no `DATABASE_URL` and no `POSTGRES_URL`.** Its seven variables are `AUTH_SECRET` (its own value),
`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `BASE44_AGENT_ALLOW_ALL`, `BASE44_API_BASE`,
`BASE44_AGENT_APP_ID` and `BRAND_SEAL_KEY`. Every database-backed page on a Preview deployment therefore fails
at the connection layer, before any tenant logic runs.

That is why Preview acceptance has never passed: not a permission problem, not a cookie problem, a missing
connection. It also means the isolation requirement is currently satisfied in the strongest possible way — there
is nothing to leak through — at the price of the environment being unusable.

The good news in the same inventory: no paid provider key is present on Preview. `ANTHROPIC_API_KEY`,
`AI_GATEWAY_API_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY` and all four `STRIPE_*` values are production-only, so
paid inference and billing cannot activate on a Preview deployment by accident.

## 3. Isolation is enforced in code, not only by configuration

Three modules refuse a production host at connection time regardless of what an environment variable says:

- `lib/db/platform-client.ts:14` — `FORBIDDEN_HOSTS = ["krzfrsaquvmwctsajhlm", "bylfizytgayoefuyliix"]`
- `lib/db/tenant-client.ts:34` — same list
- `scripts/selfhost/migrate.ts:18` — the migration runner refuses the same two hosts

The tenant path additionally requires `DATABASE_URL_TENANT` with no fallback to the main connection, and
`TENANT_RLS_ENABLED` defaults to off. So a copy-paste mistake with a Preview variable fails loudly instead of
writing to Production. This is the mechanism item 7 of the directive asks to validate, and it already exists
and is covered by tests; what it cannot do is prove the *new* database is separate — that has to be measured
once the database exists.

## 4. Options, with cost

| Option | Create cost | Run cost | Effort | Notes |
| --- | --- | --- | --- | --- |
| **A. Neon Free** (recommended) | signup + API key | **$0** | ~15 min | 0.5 GB, autosuspend, branches. Postgres 17. No Supabase dependency at all, which the app does not need: it uses Postgres only, through Drizzle |
| B. Supabase Pro | upgrade org | **$25/mo** | ~5 min | Keeps one vendor; paid, so it needs an explicit spend decision |
| C. Second free Supabase account | signup with another email | $0 | ~20 min | Same product, but two accounts to manage for one product |
| D. Local Postgres + tunnel | none | $0 | ~40 min | Rejected: exposing the sandbox to the internet, and tunnels are not a stable Preview dependency |

Estimated incremental cost of option A: **$0.00**. Vercel is already on Pro and no new deployment type is needed.

## 5. Required Preview-only configuration (not applied)

Four values must exist on Preview and nowhere else, after the isolated database exists:

| Variable | Source | Why |
| --- | --- | --- |
| `DATABASE_URL` | isolated DB, pooled connection string | The missing piece; every DB path needs it |
| `POSTGRES_URL` | same, non-pooled | Present on Production, read by tooling that expects it |
| `NEXT_PUBLIC_APP_URL` | the Preview domain | Currently production-only; OAuth and links would point at Production |
| `GOOGLE_LOGIN_CLIENT_ID` / `_SECRET` | a **second** Google OAuth client registered for the Preview domain | Registration and login acceptance cannot run on Google OIDC without it |
| `PAID_GENERATION_ENABLED` | `false`, explicit | Belt and braces even though no provider key is present |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Preview project URL | Today these are `plain` and shared, pointing at the Production project. Harmless (the app does not use `supabase-js`) but they should stop naming Production |

`AUTH_SECRET` is already Preview-only and correct: a Preview session cannot be replayed against Production.

## 6. Migration application plan (nothing applied)

1. Confirm the target is not one of the two forbidden hosts, by hostname, before writing.
2. Record `information_schema` table count on the empty database (expect the same 33-table baseline class as the
   rehearsal).
3. Apply the 18 pending pairs `0028`–`0045` in order, capturing each version string.
4. Verify: table count, RLS enabled per tenant table, foreign keys, and the `zooka_runtime` role's grants.
5. Seed two organisations and one user per organisation, with test-only credentials.
6. Prove separation: a write in the Preview database must be absent from Production (compared by row count on
   a table that exists in both), and a direct connection from the Preview environment to a Production host must
   be refused by the guard.
7. Rehearse rollback on a scratch branch of the same database before trusting the down files.

The rollback ladder is already verified on a disposable database: 33 → 46 → 34 with the seeded row surviving,
and the ten guarded down files refusing to drop a table that holds rows.

## 7. Browser acceptance matrix (nine areas, all unrun)

| Area | What proves it | Blocked until |
| --- | --- | --- |
| Registration | New account created, row count +1, verification state as designed | Preview DB + Google OAuth client |
| Login | Session cookie issued, `/workspace` 200, `/login` redirect for anonymous (captured with `maxRedirects: 0`) | same |
| Session management | Logout invalidates, replayed cookie rejected, Preview session rejected on Production | same |
| Project creation | Project visible to its owner, listed in the correct workspace | same |
| Database writes | Row present in the Preview DB, absent in Production | same |
| Tenant isolation | Org B gets 404/empty for Org A's project, tested over HTTP not just SQL | Preview DB + 2 orgs |
| Agent authorization | 403 for a tool an agent does not hold, 200 for one it does | Preview DB |
| Integrations | Unconnected connector refuses before the network; no credential crosses tenants | Preview DB |
| Error handling | Malformed payload 400, unknown route 404, unauthenticated 401/307 | Preview DB |

Two of these also need a decision: Google OIDC on the Preview domain (second client) or accept email/password
only for acceptance.

## 8. Owner decisions required

1. **Which isolated database** — Neon Free (no cost, new account) or Supabase Pro ($25/mo). Nothing is created
   until this is answered.
2. **Google OAuth on Preview** — create a second OAuth client for the Preview domain, or run acceptance with
   email/password only.
3. **Preview env writes** — permission to add the four Preview-scoped variables listed in section 5. Production
   variables stay untouched; that is not part of this request.
4. **A Preview deployment** — permission to deploy the current `feat/commander-tenant-scope` head to Preview
   only, so acceptance has something to test.
5. **Test-only accounts** — approve creating two accounts with generated credentials on the isolated database.

Still an owner action, unchanged from the previous pass: rotate the GitHub token that sat in the local remote
URL. The instructions are in `CREDENTIAL_ROTATION.md`; the token is in the secret store and has not been
rotated, revoked, or printed.
