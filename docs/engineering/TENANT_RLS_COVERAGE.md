# Tenant RLS coverage — migration 0046

Date: 2026-11-16
Scope: isolated Preview only. No Production database, no Production deployment, no merge to main.

## Why this migration exists

An audit of the isolated Preview database (`zooka-ai-preview`, Neon Free) measured the
following before 0046:

| Measure | Before | After 0046 |
| --- | --- | --- |
| Public tables | 47 | 47 |
| Tables with RLS enabled | 14 | 36 |
| Policies | 13 | 36 |
| Tables granted to `zooka_runtime` | 11 | 43 |

33 tables had no row level security at all, including `Chat`, `Message`, `Document` and
`Project`. Enabling the `TENANT_RLS_ENABLED` flag before fixing this would have enforced
isolation on the least sensitive tables while leaving customer content unisolated.

## Classification

Ownership was read from `information_schema`, not assumed.

**Tenant-owned, direct `organizationId` — 18 tables.** `AgentMessage`, `AgentSchedule`,
`Base44AgentSession`, `Chat`, `Document`, `GoogleDriveConnection`, `Invitation`, `MediaJob`,
`N8nConnection`, `OAuthConnection`, `OrganizationMember`, `Project`, `ReferralEvent`,
`StudioProject`, `StudioSpendApproval`, `Subscription`, `UsageEvent`, plus `AgentLaunchPlan`
(policy already existed and was identical, so 0046 only adds its grants).

**Tenant-owned through a parent row — 5 tables.** `Message`, `Message_v2`, `Vote`, `Vote_v2`,
`Stream` carry `chatId` but no `organizationId`. A blanket `organizationId` policy cannot
apply to them; ownership resolves through `Chat`. This is the case the directive warned
about, and it is the reason these five have a different policy shape.

**Tenant-owned, already protected — 12 tables.** The agent and browser tables. Untouched by
0046 apart from grants.

**Shared / global.** `BlogPost` had RLS enabled with zero policies, which denies everything.
0046 gives it a public read policy. `Organization` stays without RLS and gets
`SELECT, INSERT, UPDATE`.

**User-owned, deliberately not policed.** `Suggestion`, `User`, `EmailVerificationToken`,
`PasswordResetToken`. They key on `userId`, and there is no `app.user_id` request context in
the application, so any policy here would either deny all authentication traffic or fail
open. They receive grants so the auth path keeps working, and are listed under remaining
vulnerabilities.

**Auth / internal operational.** `_selfhost_migrations`, `SchedulerRun`, `WebhookEvent`,
`GuestUsage`, `Affiliate`. No tenant policy; grants are append-mostly and least privilege.

## Decisions recorded

- **No `FORCE ROW LEVEL SECURITY`.** The application connects as `neondb_owner`, which holds
  `rolbypassrls = true`. FORCE does not constrain a BYPASSRLS role, and applied to the
  current owner connection with no tenant context it would return zero rows everywhere.
- **No blanket `organizationId` policy anywhere that column does not exist.**
- **Policies cover all four commands** via `FOR ALL ... USING ... WITH CHECK`, so INSERT and
  UPDATE are constrained, not only reads.

## Verified evidence

All tests ran against a disposable database (`zooka_rls_verify`) built from the full
migration ladder, then 0046, using the real non-privileged role `zooka_runtime`
(`LOGIN`, `NOBYPASSRLS`).

Cross-tenant isolation, tenant A against tenant B rows:

- `Chat`, `Project`, `Document`, `UsageEvent`, `Subscription`: each tenant sees exactly one
  row, its own.
- No tenant context: zero rows on every protected table (fail-closed).
- `Message` via parent: each tenant sees only its own message; B is blocked writing into A's
  chat by policy; B can write into its own chat.
- A cannot SELECT, UPDATE or DELETE B's chat row; A cannot INSERT into tenant B.
- No cross-tenant mutation persisted under the owner connection after the attempts.
- No GUC bleed on a reused pooled connection.

Reproducibility: up (`exit=0`, 36 RLS / 36 policies / 43 granted tables), down
(`14 / 13 / 11`, exactly the pre-0046 state), up again (`36 / 36 / 43`), with seeded rows
surviving every step.

## Rollback

```bash
psql "$DATABASE_URL" -f lib/db/migrations/pending/0046_tenant_rls_coverage.down.sql
```

The down file drops only the 23 policies and 22 RLS enablements created here, revokes only
the grants this migration added, and restores `BlogPost` to RLS-on-with-zero-policies. It is
idempotent and rewrites no rows: enabling or disabling RLS and creating or dropping policies
never touches data.

Note: `psql -f` piped into `head` is killed by SIGPIPE mid-transaction and silently rolls
back. Redirect to a file instead.

## Remaining work before the runtime switch

The switch to `zooka_runtime` and the `TENANT_RLS_ENABLED` flag are **not** applied. Reason,
measured: 42 route and page files import the database without establishing tenant context,
including `(auth)/auth.ts`, `(chat)/api/chat/route.ts`, `(chat)/api/document/route.ts`,
`(chat)/api/history/route.ts` and `(chat)/api/vote/route.ts`. Only the agent routes are
wrapped by `withCommanderTenant`.

With RLS enforced, every one of those paths returns zero rows, so registration, login, chat,
documents and votes would break. The correct order is:

1. Extend request-scoped tenant context to every DB-touching route (the shared query layer in
   `lib/db/queries.ts` takes `organizationId` explicitly and does not publish the GUC).
2. Re-run the cross-tenant matrix plus browser acceptance against `zooka_runtime`.
3. Only then switch `DATABASE_URL` and enable `TENANT_RLS_ENABLED`.

## Known limitations

- `User` and the auth token tables have no RLS. Isolation there depends on the auth layer.
- `Organization` has no RLS; it is a shared lookup for the session's own workspace.
- A role with `BYPASSRLS` still bypasses every policy. Migration credentials must stay on the
  owner role; runtime credentials must not.
