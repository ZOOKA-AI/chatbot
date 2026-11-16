# Migration window runbook — RC-1

Order, commands and abort criteria for the production migration window. Nothing here has been
executed against production. Every number quoted was measured on a database rebuilt from a
schema-only dump of production.

## Preconditions

| Gate | Evidence required |
| --- | --- |
| Vercel billing | deployments READY again for a fresh commit (currently satisfied: `f5ab1d3` and `9b8a9d4` both READY) |
| Six journeys | `scripts/acceptance/hosted-journeys.mjs` reports 6/6, or the worksheet is signed with screenshots |
| Backup | fresh `/api/admin/backup` 200, size and sha256 recorded, restore rehearsal green |
| Access | a host that can reach the production database on 5432 — the agent sandbox cannot |
| Approval | explicit owner message naming this window |

## Step 1 — backup, before anything else

```bash
curl -sS -H "x-backup-token: $ZBACKUP" https://zooka-ai.com/api/admin/backup \
  -o zooka-backup-$(date +%Y%m%d-%H%M).json
sha256sum zooka-backup-*.json | tail -1
```

Store privately (it holds password hashes and emails). Expected shape: ~873 KB, 14 tables,
278 users, 63 chats, 315 messages, 22 documents.

## Step 2 — apply the ladder, in this order

```
0017_base44_agent_session.sql
0017_client_projects.sql
0027_agent_command_center.sql
0028 … 0049   (22 files, filename order)
```

```bash
DATABASE_URL_SERVICE='postgres://…' node scripts/selfhost/migrate.ts
```

The runner sorts base migrations then `pending/`, and skips `.down.sql`. It must exit 0 with zero
failures. `0050` is not on this branch and must not be applied.

## Step 3 — verification, before any code deploys

```sql
select count(*) from information_schema.tables where table_schema='public';        -- expect 58
select rolname, rolbypassrls from pg_roles where rolname='zooka_runtime';          -- t, must be false
select count(*) from information_schema.role_table_grants where grantee='zooka_runtime'; -- 173
select count(*) from pg_policies where schemaname='public';                        -- 65
select count(*) from "User";        -- 278, unchanged
select count(*) from "Chat";        -- 63
select count(*) from "Message_v2";  -- 315
```

Business row counts must be identical to Step 1. Any difference is an abort.

## Step 4 — abort and rollback

Abort if: the runner exits non-zero, any count in Step 3 moved, or a policy is missing.

Rollback is per migration in reverse order, `NNNN_*.down.sql`. Five of them **drop tables**
(`0029`, `0034`, `0035`, `0038`, `0039`) and carry a guard that refuses while their tables hold
rows; read the guard output, never force it. If data is already in those tables the recovery path
is the Step 1 backup, not the down file.

Restore procedure (rehearsed today, `scripts/verify-backup-restore.py`, verdict `passed: true`):

```bash
createdb zk_restore && psql zk_restore -f schema-production.sql   # schema-only dump
python3 scripts/verify-backup-restore.py --backup <file>.json \
  --target "postgresql://…/zk_restore" --out /tmp/restore.json
```

A pass means: every table in the backup has a destination, 0 foreign-key orphans, 278 users with
278 valid bcrypt hashes.
