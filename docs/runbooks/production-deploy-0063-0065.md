# Production release: n8n boundary + migrations 0063-0065

Written before the release, so the release follows a written sequence instead of a memory.
Nothing in this document has been executed against production.

## What ships, in this order

| Order | Change | Why it must be this order |
|---|---|---|
| 1 | PR #183 - proxy lets `POST /api/integrations/n8n/tiktok/run` reach its handler, which verifies the shared secret itself | Without it the scheduler gets 401 before the secret is ever read |
| 2 | PR #184 - registry gains `platform_roles_0063` | `/admin` stays locked to its own owner until the roles table exists |
| 3 | PR #185 - registry gains `tiktok_publish_jobs_0065` (imports 0063's module, so it must follow #184) | The queue table references `TikTokConnection` from 0064 |
| 4 | PR #188 - one `try/catch` so an unavailable queue answers 503 whatever the request shape | Removes an empty 500 from the scheduler's logs |

`proxy.ts` is edited by both #183 and #184. **#184 must drop its `proxy.ts` hunk before merge**, or the
two collide in the one file where a duplicate exemption is least welcome.

## Gates that must be green before step 1

1. `main` equals the commit that was tested. Record `git rev-parse main` in the release log.
2. A fresh database backup exists **before** the migration window, not after. `GET /api/admin/backup` with
   `x-backup-token`; confirm `restoreReady: true` and record `rowCount` and the SHA-256.
3. Production `/` and `/api/auth/providers` return 200 on the current deployment, so the baseline is
   healthy before the change and any breakage afterwards is attributable.
4. The migration registry on the deployed commit lists `platform_roles_0063`, `tiktok_integration_0064`
   and `tiktok_publish_jobs_0065`. If any key is missing the endpoint answers 200 with an empty `failed{}`
   and applies nothing, which is the exact failure this release exists to fix.

## Deploy

1. Merge in the order above. Merging to `main` triggers the Vercel production build; no manual deploy command.
2. Wait for `READY` on the merge commit, then verify without touching the database:
   - `GET /` returns 200
   - `GET /api/auth/providers` returns 200
   - `POST /api/integrations/n8n/tiktok/run` with **no** header returns 401 `{"error":"unauthorized"}`
   - the same path with a **wrong** secret returns 401, never 500
   - with the correct secret it returns 503 `{"error":"queue_unavailable"}` before the migration, which is
     the correct answer while the table is absent
3. If any of those differ, stop and roll back. Do not continue to the migration window.

## Migration window

1. Take the backup (gate 2). Confirm the file downloaded and its SHA-256 matches.
2. `POST /api/admin/migrate` with `x-migration-token`. Read the body, not the status: `200` with a
   non-empty `failed{}` is a failure.
3. Verify the schema, not the response:
   - six tables present: `PlatformRole`, `PlatformAuditLog`, `TikTokConnection`, `TikTokUpload`,
     `TikTokPublishJob`, `TikTokPublishEvent`
   - `relrowsecurity = true` on all six
   - `PlatformRole` contains the owner's bootstrap grant before `/admin` is expected to open
4. `POST /api/integrations/n8n/tiktok/run` with the correct secret returns 200 with `tenants: 0` and
   `note: "no_due_work"`, not 503.
5. Run the migrate endpoint a second time. It must be idempotent: `applied` empty or repeatable, `failed{}`.

## Rollback

Three independent layers. Use the smallest one that fixes the problem.

**Layer 1 - code only.** Vercel keeps the previous deployment. Promote it from the project's deployments
list, or redeploy the last known-good commit. Effect: the proxy exemption and the 503 handler revert; the
tables stay, which is harmless because nothing reads them until the code returns.

**Layer 2 - schema.** Only if a table is wrong, not if the app is wrong. Reverse in the opposite order of
application, because 0065 references a table 0064 creates:

```
0065_tiktok_publish_jobs.down.sql
0064_tiktok_integration.down.sql
0063_platform_roles.down.sql
```

Verified on a disposable Postgres: this order leaves zero of the six tables behind. Reversing 0063 first
fails on the foreign key, so the order is not cosmetic.

**Layer 3 - data.** Only from the backup taken in the migration window. This is destructive and needs the
owner's explicit word; layers 1 and 2 exist so this layer is never needed.

## Abort criteria

Stop and roll back layer 1 if any of these appear:

- a 500 with an empty body on the n8n path, which means the handler escaped rather than refused
- any path other than the n8n one answering without a session
- `/` or `/api/auth/providers` failing after the deploy
- the scheduler receiving anything other than 401/503 before the migration and 200 after it

## What this release does not make work

Deploying and migrating does **not** enable automatic publishing. TikTok OAuth is still `not_configured`:
the only TikTok developer app belongs to Royal Haroon, and the ZOOKA-AI client key, secret and state
secret are absent from Vercel. The queue will drain nothing until a ZOOKA-AI app exists and its
credentials are installed. That is a separate decision with its own evidence trail.
