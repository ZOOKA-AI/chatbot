# Database schema drift: production against the repository

**Audited:** 16 November 2026, against production `krzfrsaquvmwctsajhlm` (PostgreSQL 17.6) and the migrations in `lib/db/migrations/` including `pending/`.
**Method:** catalogue introspection only. Production was read, never written. Both sides were inspected through `information_schema` and `pg_catalog` by `scripts/schema-drift-audit.py`, so nothing here is inferred from filenames.

**One caveat, stated up front:** production runs PostgreSQL 17.6 and this environment runs 15.19, and a schema-only export cannot be replayed across majors (it fails on `transaction_timeout`, and on the `vector` type, which only production has). So the two catalogues were read where they live rather than side by side on one version. Object-level comparison across these majors is reliable for tables, columns, types, defaults, constraints, indexes and policies. It says nothing about planner or storage differences, which are not what this report is about.

---

## 1. What the numbers say

| Catalogue | Production | Migrations (with `pending/`) |
|---|---|---|
| Base tables | 40 | 37 |
| Columns | 369 | 291 |
| Constraints | 89 | — |
| Indexes | 91 | — |
| RLS-enabled tables | 40 | 37 |
| Policies | 33 | 33 |
| Extensions | 7 | 1 |
| Roles | 14 | 3 |

Table-level totals hide the point, so the audit classifies every difference instead.

## 2. Classification

### 2.1 Genuine drift — the application breaks

These are differences where code the repository actually ships would fail against a database built the way the repository says.

| Object | Direction | Effect | Correction |
|---|---|---|---|
| `Chat.deletedAt` | missing in migrations | Every chat listing filters `isNull(Chat.deletedAt)`. A migration-built database cannot run one chat query. | `pending/0036_chat_soft_delete.sql` |
| `User.emailVerifiedAt` | missing in production | `schema.ts` selects this column; production carries the older `emailVerified` instead. This branch would fail the first read of that column against production, which is a merge blocker rather than a preview annoyance. | `pending/0037_email_verified_at.sql`, backfilling from `emailVerified` |

Both are now corrected, and the correction was verified rather than assumed:

- `tests/unit/migration-schema-parity.test.ts` reads the ORM's own table metadata and asks a live database whether each declared table and column exists. Before 0036 it failed with seven missing columns and three missing tables; after 0036 and the pending agent migrations it passes with none.
- 0037 was applied to a production-shaped database and copied the single verified account across (`emailVerifiedAt` backfilled: 1 of 1), then applied a second time to prove it is idempotent.

### 2.2 Expected environment difference — not drift

| Category | Count | Why it is not a defect |
|---|---|---|
| Supabase platform roles (`anon`, `authenticated`, `authenticator`, `service_role`, `supabase_admin`, …) | 11 | These exist because production is Supabase, not because the schema is wrong. A local database cannot and should not have them. |
| Extensions (`pg_graphql`, `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`, `vector`) | 6 | Platform-installed. `vector` matters only for `Document.embedding`, a feature the ORM never reads. |
| Grants to platform roles | 3 grantees differ | Production's 728 grants include Supabase's own administration surface; `security_lockdown_0022` deliberately revoked `anon` and `authenticated`. |
| Tables created by the admin migration route rather than a numbered migration (`BlogPost`, `MediaJob`, `agent_memory`, `billing_event`, `file`, `integration_audit`, `integration_connection`, `integration_provider`, `lead`, `mcp_api_key`, `price_snapshot`, `usage_counter`, plus legacy `Account`, `Session`, `VerificationToken`) | 15 | Real, but not reproduced by migrations. This is how they came to exist, and it is the cheapest explanation rather than an accusation. |
| Agent core tables present in migrations, absent in production (`AgentTask`, `AgentDecision`, `AgentApproval`, `AgentDeployment`, `AgentIdentity`) and `Project` | 6 | `pending/` migrations, deliberately unapplied. Expected until the owner authorises a production migration. |

### 2.3 Legacy columns — present in production, unused by the ORM

Production carries 8 columns the ORM never selects: `User.name`, `User.image`, `User.emailVerified`, `Organization.slug`, `Organization.ownerId`, `Organization.plan`, `Organization.deletedAt`, `Document.embedding`.

**These were deliberately not copied into migrations.** Adding them would be copying production rather than reconciling it, and it would enshrine an abandoned Auth.js layout as if it were the intended schema. The consequence is recorded rather than hidden: a strict restore of a production backup into a migration-built database fails on exactly these columns, and the restore path now drops them explicitly and reports which ones per table.

### 2.4 Index and constraint differences

63 index and 59 constraint differences were reported, overwhelmingly as a consequence of the table differences above rather than as independent defects. No index that the ORM depends on was found missing after 0036: the parity test covers columns and tables, and the query paths exercised by the Commander suites (organisation scoping, cursor pagination, task claiming) all run against a migration-built database in the test suite.

---

## 3. Recovery validation

Performed against the live backup artifact (`854,794` bytes, generated 16 Nov 2026 01:18Z) and two independent databases, each built from the repository migrations plus `pending/`.

| Check | Result |
|---|---|
| Backup rows | 1,875 across 9 populated tables |
| Coverage | All 9 tables restored with counts matching the source exactly; no table lacked a destination |
| Foreign key integrity | 0 orphaned rows across every foreign key in the restored database |
| Authentication data | 277 of 277 credentials restored as well-formed bcrypt hashes; 1 verified account preserved through 0037's backfill |
| Repeatability | Run 1 and run 2 produced identical per-table counts and statuses |
| Production isolation | Refused by name: the script aborts on any production host |
| Data dropped, explicitly | `User`: name, image, emailVerified; `Organization`: slug, ownerId, plan, deletedAt; `Document`: embedding |

One earlier claim in this project needs correcting here. A previous stage reported "8 of 9 tables restored" from a hand-run sequence; that number came from a schema built from migrations alone, before the pending agent migrations and 0036 were applied. With the corrected schema, coverage is complete.

A second correction: an initial pass of the recovery script failed the run because only 15 of 277 accounts store an email containing `@`. Checking production directly showed the same 15 — 262 accounts were created without one. The check was wrong, the data was not, and it is now reported rather than graded.

---

## 4. Execution health and alerting

`GET /api/agents/health` (owner/admin, inside the tenant scope) reports queue depth with the age of the oldest waiting task, executions holding an expired lease, failures in the last hour, the last scheduler pass, and parked approvals. A critical verdict answers 503.

Tests, all against real PostgreSQL or the route itself: fresh pass and empty queue; three-hour backlog quoting its age; a 50-task backlog counted exactly; a lease expired five minutes ago; one failure warning where six escalate; never-scheduled reported honestly; one workspace's backlog never moving another's verdict; and four route cases — no session (401), a member (403), an owner reading (200), and a critical verdict mapped to 503.

Alerting (`lib/agents/alerts.ts`) is pure logic over an explicit history: it derives alerts from health, suppresses repeats inside a per-severity cooldown (1h critical, 6h warning), sends immediately when a warning escalates to critical, and reports recovery once so silence is not ambiguous. Nothing is sent by the module, no table was added, and no paid service is involved. Ten tests cover the restraint as carefully as the delivery.

---

## 5. What remains open

1. **`0037` must be applied to production before this branch's code is deployed**, otherwise the first read of `User.emailVerifiedAt` fails against production. It is a pending migration by policy, not by oversight.
2. **`Document.embedding`** cannot be reproduced locally: the `vector` extension is not installed in this environment, and the feature it supports writes nothing (`doc_embeddings = 0`).
3. **Fifteen tables exist only because the admin route made them.** They should become numbered migrations eventually; doing that now would mean transcribing DDL nobody has reviewed, which is a separate, careful task.
4. **No browser acceptance session exists**, so the health endpoint's HTTP behaviour is verified at the handler and against the database, never through a signed-in browser.
