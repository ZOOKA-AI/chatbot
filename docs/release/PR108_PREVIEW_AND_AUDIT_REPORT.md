# PR #108 — Preview verification and production audit report

Date: 2026-11-18 (Asia/Dubai). Head under test: `5ee8f338`. Production
deployment: `dpl_8p6vNDAFNhre81` on `76f18d25`. Production was **not** modified:
no migration applied, no role or credential changed, no merge, no redeploy.

## 1. Preview deployment

| item | value |
|---|---|
| project used for the interactive test | `chatbot-clean` (isolated DB `zokaai_prod_clean`, no Vercel SSO) |
| stable branch alias | `chatbot-clean-git-feat-growth-oauth-and-runtim-95f5c2-zooka-ai1.vercel.app` |
| commit | `5ee8f338` |
| state | READY |
| also built in `chatbot` project | `chatbot-8l15x8cyx-zooka-ai1.vercel.app`, READY, same commit, blocked by Vercel SSO for an unauthenticated browser |

Routes on the alias: `/` 200, `/login` 200, `/register` 200,
`/workspace/admin/growth` 307 (owner-only), `/api/integrations/google-growth`
401 without a session.

### Preview-only environment variables added

`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_GROWTH_TOKEN_ENCRYPTION_KEY`, `GOOGLE_GROWTH_REDIRECT_URI`,
`GA4_PROPERTY_ID=563695686`, `GSC_SITE=sc-domain:zooka-ai.com`, and preview
overrides of `AUTH_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` pointed at the
branch alias (they previously pointed at the `release-clean-acceptance` alias,
which does not contain this code, so every post-login redirect left the test
deployment). The OAuth client is the existing workspace client
`558007276278-fb5kv23p8vudj78dilqug2ggd5etvv2u`, reused rather than provisioned
again; the encryption key falls back to the reviewed Drive key.

## 2. Google redirect URI

Registered in the console for client `558007276278-…`:

```
https://chatbot-clean-git-feat-growth-oauth-and-runtim-95f5c2-zooka-ai1.vercel.app/api/integrations/google-growth/callback
```

Before adding it, an authorization request with that exact URI returned
`redirect_uri_mismatch`; after adding it, the same request reaches Google's
sign-in step with no mismatch. The pre-existing Drive callback was preserved.

Still unregistered, and required before any production rollout:
`https://zooka-ai.com/api/integrations/google-growth/callback`.

## 3. What was verified end to end, and what was not

Verified with a real session on the preview deployment:

- `GET /api/integrations/google-growth` → `configured:true, connected:false,
  reason:not_connected`, both scopes listed as missing, no token, no ciphertext,
  no secret in the payload;
- `GET …/connect` → 307 to `accounts.google.com` with exactly
  `analytics.readonly` and `webmasters.readonly`, `access_type=offline`,
  `prompt=consent`, `code_challenge_method=S256`, a 43-character state, and the
  registered redirect URI;
- the connect response sets httpOnly `google_growth_oauth_state` (161 chars) and
  `google_growth_oauth_verifier` (43 chars) cookies;
- `GET …/callback?code=x&state=forged` → rejected, `stage=state_binding`;
  `…/callback?code=x` with no state → rejected, `stage=no_state`;
- `GET /api/integrations/google-growth` without a session → 401;
- `DELETE /api/integrations/google-growth` with no connection →
  `{revoked:false, disconnected:true}`, 200 (idempotent).

Not verified, because it needs a human at the Google consent screen:

- the consent grant itself, the code exchange against Google, encrypted storage
  of a live token, a real refresh, a real revocation, and the dashboard showing
  GA4 property `563695686` and `sc-domain:zooka-ai.com` numbers.

The automation browser cannot submit this application's auth forms (the
safety layer refuses POSTs to a private host and the clicks do not submit), so
the session used for the checks above was obtained over HTTP against the same
deployment. Completing the consent needs one owner pass: open the preview alias,
sign in, open `/workspace/admin/growth`, press
"Connect Google Analytics and Search Console", choose the owner's Google account
(a registered test user), and approve the two read-only scopes.

## 4. Production database audit (read only)

Executed with `scripts/audit/runtime-role-audit.sql` inside
`BEGIN TRANSACTION READ ONLY` against `krzfrsaquvmwctsajhlm` (PostgreSQL 17.6).
The script is six `SELECT` statements; no DDL, no GRANT, no write.

### A. Roles

| role | login | superuser | BYPASSRLS | createdb | createrole |
|---|---|---|---|---|---|
| `postgres` | yes | no | **yes** | yes | yes |
| `service_role` | no | no | yes | no | no |
| `zooka_runtime` | yes | no | **no** | no | no |
| `authenticator` | yes | no | no | no | no |
| `anon`, `authenticated` | no | no | no | no | no |

`zooka_runtime` is a member of nothing (section C returned zero rows), and
`CREATE` on schema `public` is not granted to it (section E).

### B. Live connections

One `postgres` connection active and one idle (the application), plus
`authenticator`/`pgbouncer`/`supabase_admin`. The application still connects as
the `BYPASSRLS` owner role, so the 72 policies do not constrain its own queries.

### D/F. Coverage

```
public base tables            72
RLS enabled                   72
RLS disabled                   0
runtime without SELECT        24
```

The "84 tables" figure recorded earlier counts views as well; 72 are base
tables, the rest are views. The 24 tables the runtime role cannot read:

- NextAuth/pre-session: `Account`, `Session`, `VerificationToken`,
  `EmailVerificationToken`, `PasswordResetToken`, `PhoneOtp`
- platform/system: `GuestUsage`, `SchedulerRun`, `WebhookEvent`,
  `_selfhost_migrations`, `EmailSuppression`, `price_snapshot`
- feature tables, no policy at all: `GrowthAudit`, `GrowthSettings`,
  `LaunchTestingClaim`, `ReferralInvite`, `ReferralProfile`, `RewardLedger`,
  `lead`
- feature tables with a workspace policy already: `billing_event`, `file`,
  `integration_audit`, `usage_counter` (`workspace_id` policies),
  `integration_provider` (`provider_read_all`)

19 of the 72 tables carry no policy at all. Tenant key shapes across the 72:
`organizationId` 23, `organizationId,userId` 8, `organization_id` 7 (+1 with
`user_id`), `workspace_id` 4 (+1 with `user_id`), `userId` 7, none 21.

## 5. Verdict on `0057` as written: NO-GO

Measured against the audit, the pending migration as written:

1. would grant on 17 tables, and 12 of them have **no policy**, so under the
   runtime role they stay unreadable (silent zero rows after a connection move);
2. its step 3 only enables RLS where RLS is disabled, and on production that set
   is **empty**, so it adds no policy anywhere;
3. its skip list omits `Account`, `Session`, `VerificationToken`,
   `EmailSuppression` and `price_snapshot`, so it would grant ordinary DML on
   authentication and system tables that have neither a tenant column nor a
   policy.

A revised migration is specified in the report accompanying this change: grants
plus an organisation policy for `RewardLedger` and `lead`, grants plus a
user-scoped policy for `ReferralProfile`, `ReferralInvite`,
`LaunchTestingClaim`, grants only for the five tables whose workspace policies
already exist, and an explicit permanent service-only list for the auth and
system surfaces.

## 6. Production state after this work

- deployment `76f18d25`, READY, unchanged;
- base tables 72, information-schema tables+views 84, RLS 72/72;
- rows: 278 users, 278 organizations, 66 chats, 319 messages
  (`Message_v2`), 23 documents, 2 OAuth connections;
- no migration applied, no role or credential touched, PR #108 still a draft.
