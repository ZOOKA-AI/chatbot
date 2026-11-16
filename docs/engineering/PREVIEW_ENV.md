# Preview environment: variables, roles, and OAuth

Decisions taken by the owner on 16 Nov 2026: a separate free PostgreSQL database
named `zooka-preview` (preferably `ap-southeast-1`), Preview Google OAuth for
sign-in, and Production never used as a substitute for acceptance testing.

## Provisioning status

**Blocked, and the block is the management token.** `SUPABASE_ACCESS_TOKEN` now
returns `401 {"message":"JWT could not be decoded"}` on `/v1/projects`, having
returned `200` earlier in the day. So neither the organisation id nor a create call
is available. Per instruction there were no retries and no attempt to work around
authentication.

## Manual steps for the owner (ten minutes, no cost)

1. supabase.com → New project → name `zooka-preview`, region `ap-southeast-1`,
   plan **Free**. Save the database password somewhere safe.
2. Project → Connect → copy the **Transaction pooler** URI (port `6543`).
3. Vercel → `chatbot` → Settings → Environment Variables → add each of the
   following with scope **Preview only**:

| Variable | Value | Purpose |
|---|---|---|
| `DATABASE_URL` | pooler URI of zooka-preview | The app's own runtime connection |
| `DATABASE_URL_TENANT` | same host, user `zooka_runtime` | Tenant-restricted connection the Commander uses |
| `DATABASE_URL_PLATFORM` | same host, `postgres` user | Queue selection only; refuses production hosts by code |
| `TENANT_RLS_ENABLED` | `on` | Turns on the tenant path; off by default |
| `SCHEDULER_TOKEN` | 32 random bytes | Authorises `/api/agents/scheduler`; absent means the endpoint answers 401 |
| `GOOGLE_LOGIN_CLIENT_ID` / `GOOGLE_LOGIN_CLIENT_SECRET` | see OAuth below | Preview sign-in |

4. Run `scripts/preview-db-provision.sh` against the new database with
   `ADMIN_URL` (pooler, `postgres`) and `RUNTIME_PASSWORD`. It applies the seven
   migrations in order, sets the runtime password without printing it, and prints
   its own `PASS` lines for the restricted role and for RLS.

**Nothing above is done by me automatically, because every step needs a credential
I must not hold.** Steps 1 to 3 are the owner's; step 4 is one command I can run
the moment the connection string exists in the environment.

## Least privilege, as applied by the script

| Role | Used for | Rights |
|---|---|---|
| `postgres` | migrations, and `DATABASE_URL_PLATFORM` selection | Full. Never used for tenant work. |
| `zooka_runtime` | every tenant read and write | `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`, member of nothing, owner of nothing, four grants on five tables, `CREATE` on `public` revoked |

Migration order is not cosmetic: `0031` revokes every table grant, so `0034` and
`0035` must run **after** it, and the script re-applies `0035`'s grants at the end
for exactly that reason. RLS coverage is asserted, not assumed: the script fails
loudly unless all five Commander tables have `relrowsecurity = true`.

## Google OAuth

The application mounts NextAuth at `app/(auth)/api/auth/[...nextauth]`, so the
callback is:

```
https://<preview-host>/api/auth/callback/google
```

Provider credentials are read from `GOOGLE_LOGIN_CLIENT_ID` and
`GOOGLE_LOGIN_CLIENT_SECRET` (a separate, non-sensitive client from the main one).
Neither variable is present in the Preview scope today, which means Preview has no
Google client at all: it cannot sign anyone in even if SSO were out of the way.

To enable it, add the Preview hostname as an **authorised redirect URI** on the
Google OAuth client and set both variables for Preview only. Production's
redirect URIs must not be edited: they are what keeps `zoka-ai.com` sign-in
working, and changing them is a production change requiring approval.

Two independent gates remain after that, and both are owner decisions: Vercel
Deployment Protection (which must not be bypassed) and a Preview-specific
`AUTH_SECRET`, which is already separate and is what makes a production session
unreplayable on Preview.
