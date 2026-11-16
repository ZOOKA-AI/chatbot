# RC-1 Security and Acceptance Gate — 2026-11-16 22:45 Dubai

Branch `release/rc-1`, HEAD `1bb6cba`. Preview deployment for that commit: READY.

## Phase 1 — Account verification (production backup 18:18:38Z, 278 users)

| Field | Value |
| --- | --- |
| Email | helmyharoon8@gmail.com |
| Account id | aad414a8… |
| Organization | "helmyharoon8's workspace" |
| Role | owner |
| Subscription | plan `pro`, status `active` |
| `emailVerifiedAt` | null (column unset; does not block credentials login) |
| In Preview | No. Preview holds 7 accounts, all acceptance-provisioned |

No personal row was copied into Preview, no password touched, no subscription
modified.

## Phase 2 — Authentication

Proven on Preview with the dedicated acceptance identity: login through the real
credentials callback, session creation, persistence across two reads 2 s apart,
logout, and protected routes returning 307 to `/login` without a session.

Production read-only: `/login` 200, `/api/auth/providers` 200.

NOT TESTED: login as helmyharoon8@gmail.com. No credential for that account
exists in the vault, and copying personal identity data into Preview is
prohibited. Requires one interactive owner login.

## Phase 3 — Pro subscription

Database evidence: `Subscription.plan = pro`, `status = active` on the owner's
organization. Live entitlement screens, credit balance and usage counters were
NOT verified because they need that account's session. Billing remains inactive
(`PAID_GENERATION_ENABLED=false`, `0050` absent from this branch).

## Phase 4 — Functional

Preview route map (bypass header): `/` 200, `/ar` 200, `/pricing` 200, `/blog`
200, `/login` 200, `/register` 200, `/workspace` 307, `/workspace/agent` 307,
`/workspace/projects` 307, `/workspace/studio` 307, `/settings/integrations` 307.
`/en` returns 404, so English is served by the in-page language switch, not a
path prefix.

Verified by execution: agent turn through the isolated Preview webhook with
`AgentMessage` written (4 rows present), anonymous `/api/agent` 405, error
handling on unauthorized writes (permission denied instead of silent success).

NOT TESTED: mobile responsiveness (no viewport control available), English
toggle interaction, dashboard widgets beyond route reachability.

## Phase 5 — Registration: OPEN

A real browser was used, not a database insert. `#email` and `#password` accepted
25 and 16 characters in Chrome on the Preview deployment. Submission was then
blocked by the automation layer itself — "Refusing Enter — the focused form
submits to a local/private URL" — because the form's action is a `javascript:`
thrower handled client-side. Two coordinate clicks produced no navigation. The
database still holds 7 users, 7 organizations, 7 memberships, 7 subscriptions,
and zero rows for the attempted identity. No synthetic account was created.

## Security gate — database runtime role

1. Actual Preview application role: **`neondb_owner`, `BYPASSRLS = true`**. RLS is
   therefore not enforced for application queries today.
2. Cross-tenant test through the same connection path: the owner role reads every
   tenant's rows; that is the bypass behaving as designed, not a policy result.
3. `zooka_runtime`: `LOGIN`, `BYPASSRLS = false`, connects successfully, holds
   grants on 40 of 47 tables.
4. Enforcement proven with the least-privilege role and `app.organization_id` set
   per transaction: `AgentMessage` → context A sees 1, context B sees 1, no
   context sees 0, cross-read of B's row from context A returns 0, cross-update
   affects 0 rows. Policies work when the role does not bypass them.
5. Gaps blocking the switch: 9 tables carry no RLS at all — `Affiliate`,
   `EmailVerificationToken`, `GuestUsage`, `Organization`, `PasswordResetToken`,
   `SchedulerRun`, `User`, `WebhookEvent`, `_selfhost_migrations`. With the
   runtime role and no context it still sees all 7 organizations, so tenant
   enumeration is open on that table.
6. Grants missing for 7 tables, including `Organization`,
   `EmailVerificationToken`, `PasswordResetToken`. A runtime-role insert into
   `Organization` fails with "permission denied", so moving Preview onto
   `zooka_runtime` today would break registration and password reset.
7. No production credential was read, printed or changed. Preview keeps its own
   Neon database; the new preview agent secret lives only in the vault.

Conclusion: least-privilege runtime is **not ready**. It needs (a) grants and
tenant policies for `User`, `Organization` and the token tables, (b) a service
connection (`DATABASE_URL_SERVICE`) for registration and membership writes, then
(c) `DATABASE_URL_TENANT` + `TENANT_RLS_ENABLED` on the Preview scope only. The
flag was deliberately not flipped, because flipping it now trades a bypass for a
broken signup path.

## Verdict

NO-GO. Two gates remain open: a real browser registration by the owner, and
runtime RLS enforcement on a least-privilege connection. Production untouched
(`19473c0`, 278 users), PR #98 not merged, no migration applied, no payment path
active.
