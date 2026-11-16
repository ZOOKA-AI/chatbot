# ZOOKA-AI — Security Status

## PR #91 — `/api/admin/backup` hardening

State: **DRAFT, security release candidate, not merged, not deployed.**

### What was actually wrong on production

| Probe | Observed |
|---|---|
| no token / empty / wrong / POST | 401 / 401 / 401 / 405 — authentication itself was sound |
| **with** the valid token | 200, `cache-control: public, max-age=0, must-revalidate`, no `no-store`, body carrying `User.password` hashes and emails |
| database failure | 500 body carried the driver message: role name, host, table names |

### Fix, as merged in the PR

1. `private, no-store, max-age=0, must-revalidate`, `pragma: no-cache`,
   `x-robots-tag: noindex, nofollow` on every response including refusals.
2. Two exports, each labelled: `?mode=redacted` for sharing (`restoreReady:
   false`, credential columns `[redacted]`), default for disaster recovery
   (`restoreReady: true`, unchanged data). The default was kept full on purpose:
   redacting a backup would break account restoration, which the owner raised and
   which is now a test.
3. Failure path returns `{error, requestId}` only.
4. `x-request-id` on every response; refusals log one JSON line with `ts, route,
   result, status, reason, requestId`. No token, no submitted value, no row data.
5. Constant-time token comparison, fails closed when `BACKUP_TOKEN` is unset.

### Verified vs blocked

- VERIFIED: 8 security tests + 4 real-HTTP tests over a real Postgres engine,
  including a full export/restore round trip that authenticates a restored user.
- BLOCKED: live verification on Vercel Preview (302 deployment protection, bypass
  not creatable by API). This is an access-layer block, not a code defect.

### Residual risk

1. No retained request logs, so past unauthorised attempts cannot be reviewed.
   Refusal logging covers the future only.
2. `BACKUP_TOKEN` is present in four conversation folders as a plaintext file
   (mode 600, 48 characters). It is absent from the repository. Treat it as
   exposed to anyone with sandbox access and rotate on the runbook schedule.
3. A redacted export is still a full schema and row-count disclosure; share it
   only with parties who may see the shape of the database.
4. `tsconfig.tsbuildinfo` is tracked in the repo and keeps reappearing in diffs;
   repo hygiene, separate change.

## Rotation readiness

See `ROTATION_BACKUP_TOKEN.md`. Runbook complete, execution blocked on owner
approval because it requires changing a production environment variable.
