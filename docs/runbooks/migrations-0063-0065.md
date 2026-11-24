# Applying 0063, 0064, 0065 to production

Status: **not applied.** Production runs `4da6405` with none of these tables. Nothing here runs
without the owner's explicit approval; this is the plan to run *then*.

| # | File | Tables | Owner |
|---|---|---|---|
| 0063 | `0063_platform_roles.sql` | `PlatformRole`, `PlatformAuditLog` | Core |
| 0064 | `0064_tiktok_integration.sql` | `TikTokConnection`, `TikTokUpload` | Social |
| 0065 | `0065_tiktok_publish_jobs.sql` | `TikTokPublishJob`, `TikTokPublishEvent` | Social |

Order matters: 0065 references `TikTokConnection` from 0064, and 0063 must precede any code path that
reads a platform role. All three are additive (new tables only, no column changes to existing tables),
and all six tables enable row level security.

## Preflight

1. `GET /api/admin/migrate` returns 405 by design; use the POST path only when executing.
2. Confirm the migration runner's journal contains 0063, 0064 and 0065. **Known defect:** the runner
   recorded 0064 only, so 0063 and 0065 would be skipped silently. Fix the journal before running, or
   apply the three statements explicitly. Do not run the path until this is verified.
3. Confirm no duplicate migration numbers in `lib/db/migrations/pending/`.
4. Snapshot: `GET /api/admin/backup` with `x-backup-token`, store the dump privately (it contains
   password hashes and emails).

## Execute

1. Apply in order: 0063 → 0064 → 0065, one at a time, reading `applied[]` and `failed{}` after each.
2. Stop at the first `failed` entry; do not continue to the next file.

## Verify

```sql
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('PlatformRole','PlatformAuditLog','TikTokConnection','TikTokUpload',
                    'TikTokPublishJob','TikTokPublishEvent');
```
Expect six rows, all `relrowsecurity = true`. Then: `/admin` renders for the owner (0063), and
`POST /api/integrations/n8n/tiktok/run` with a valid secret answers 200 with `drained: []` (0064/0065).

## Recovery

Each file has a `.down.sql`. They refuse to drop a table that still holds rows, so a rollback after
real publishing needs a decision, not a command: export the rows first, then roll back 0065 → 0064 →
0063. Rolling back 0063 removes the platform role grant and re-locks `/admin` for everyone including
the owner, which is the safe direction.
