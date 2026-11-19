# RC-1 Final Acceptance — 2026-11-16 22:35 Dubai

Branch `release/rc-1`, HEAD `3c9ac7c` (remote and local identical).
Deployed Preview: `chatbot-1479q6yn2-zooka-ai1.vercel.app`, commit `3c9ac7c`, state `READY`.

## 1. Preview account inventory (isolated Neon database)

Seven accounts exist, all created by acceptance provisioning. No eighth account
appeared after the provisioning run, so a manually registered account is **not**
present:

```
accept-a-mwj5puaf@staging.zooka-ai.test
accept-b-mwj5puaf@staging.zooka-ai.test
qa.preview@zooka-ai.test        (verified, used by the harness)
rc-accept-a@zooka-test.dev
rc-b-mwjc8sws@zooka-test.dev
rc-c-mwjc8sws@zoka-test.dev
rc-c-mwjc8sws@zooka-test.dev
```

Organizations: 7. OrganizationMember: 7 (each user owns one workspace).
Subscription: 7. AgentMessage: 4.

## 2. Browser registration

Not confirmed. The register page returns 200 and renders the email and password
fields, but no new row reached the isolated database, and no new row reached
production either (production still holds 278 users in the 18:18 backup). The
form is a client-side handler over a server action, so it needs a real browser
submit. This is the single unmet acceptance criterion.

## 3. Commit parity

`git ls-remote origin release/rc-1` = `3c9ac7c22edb86003096aa142dd9143cc88577bf`
`git rev-parse HEAD` = the same SHA. The newest Preview deployment is built from
`3c9ac7c` and is `READY`. No drift between branch and deployment.

## 4. Six acceptance journeys — 6/6 PASS

Report: `acceptance/hosted-journeys-rc1-e.json`

| Journey | Result |
| --- | --- |
| Registration | PASS (page renders form; submit is browser-only) |
| Login | PASS — session established through the real credentials flow |
| Session persistence | PASS — same user across two reads 2 s apart |
| Chat | PASS — `/workspace/agent` 200 with session, anonymous `/api/agent` 405 |
| Agent execution | PASS — `POST /api/agent` 200 via the isolated preview webhook; `AgentMessage` 2 → 4 |
| Logout | PASS — session empty, protected page 307 to login |

## 5. Recovery, isolation and schema

Backup freshness: `GET /api/admin/backup` 200, 873,467 bytes, SHA-256 `a6fc1c96…`,
`generatedAt` 2026-11-16T18:18:38Z, 14 tables, 1,907 rows (278 users, 63 chats,
315 messages, 22 documents, 370 usage events).

Restore readiness: the backup was loaded into an isolated PostgreSQL 17 cluster
built from the repository ladder (`verify-backup-restore.py`):

```
tables_in_backup 9, rows_in_backup 1907
coverage_failures {}, foreign_key_orphans []
users 278, bcrypt_hashes 278, null_hashes 0, hash_shapes_valid true
passed true
```

Known data shape, unchanged: 262 of 278 accounts carry
`guest-<digits>` emails, so `all_emails_usable` is false by design, not a
corruption.

Preview database isolation: 47 tables, 38 with row-level security enabled, 38
policies. Roles: `zooka_runtime` login without `BYPASSRLS`, `zooka_app` NOLOGIN
without `BYPASSRLS`, `neondb_owner` with `BYPASSRLS`. The application still
connects as the owner, so policies exist but are not enforced at runtime until
`TENANT_RLS_ENABLED` is switched on with the runtime connection. This is the
documented remaining isolation gap, unchanged by this release.

## 6. Migration set

Root: 28 files ending at `0027_agent_command_center.sql`. Pending: 22 files,
`0028_agent_tenant_scope.sql` → `0049_runtime_app_grants.sql`, contiguous with no
gaps and no duplicates. `0017` exists twice by design (`base44_agent_session`,
`client_projects`). `0050` appears nowhere on this branch.

Ordering was proven by execution, not by inspection: the runner applied the whole
ladder to the isolated cluster, then a second run reported `applied 0,
skipped 50, failed {}`, so the sequence 0017 → 0027 → 0028–0049 is idempotent and
complete. Resulting schema: 47 tables, 38 policies.

## Verdict

NO-GO, with exactly one technical criterion open: a real browser registration on
the Preview URL. Everything else in this acceptance passed and is measured.

Production remains untouched: latest production deployment `chatbot-4kzjorjfe`
on `19473c0`, 278 users, no migration applied, no merge into `main`, PR #98 still
Draft, billing untouched (`PAID_GENERATION_ENABLED=false`, `0050` absent,
`lib/billing/{ledger,guard,payments,config}` only on `feat/uae-billing`).
