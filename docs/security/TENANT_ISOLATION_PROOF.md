# Customer isolation, proven on real rows

**Date:** 2026-11-18. **Method:** isolated PostgreSQL 17.12 cluster, repository migration ladder, real production rows, the real least-privilege role. **No production change.**

## Why this proof and not a page-load

The live application connects as the owner role (`rolbypassrls = true`), so RLS is not enforcing anything on ordinary requests, and `lib/db/tenant-client.ts` refuses production hosts by design (B4). Neither of those is a reason to leave isolation unproven. It can be proven where the runtime role actually runs, with the customers' own rows, on a schema built from the same migration ladder production runs.

## How it was built, so it can be rebuilt

1. `initdb` on an isolated cluster (127.0.0.1, port 55436), trust auth, single-purpose.
2. The repository ladder was applied with the real runner: `scripts/selfhost/migrate.ts`, 28 root migrations plus the pending series through 0057. Result: 62 tables, `failed = {}`.
3. Real production rows were loaded from the private backup through `jsonb_populate_recordset`: 1921 rows in 14 tables, giving 279 users, 279 organisations, 66 chats, 319 messages, 23 documents, 372 usage events. Zero load errors.
4. `zooka_runtime` was created as `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`, given `USAGE` on `public` and `SELECT/INSERT/UPDATE/DELETE` on the tenant tables (48 with `SELECT`, the same count production grants), and nothing on the 19 service-only tables.
5. Two real tenants were taken from the data itself, not invented: the organisation with the most chats (A) and the next one (B).

Script: `scripts/audit/proof-cross-tenant-isolation.py`. Raw numbers: `docs/security/tenant-isolation-proof.json`.

## What the role is

| property | value |
| --- | --- |
| superuser | false |
| bypass RLS | false |
| create database / role | false / false |
| tables reachable | 48 |
| `CREATE` on schema `public` | false |
| `Account`, `Session` readable | no (permission denied) |
| may `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` | refused |
| may `CREATE TABLE` | refused |
| may `SET ROLE postgres` | refused |

## Results on the customers' own rows

| check | tenant A | tenant B |
| --- | --- | --- |
| real chats | 25 | 8 |
| real documents | 16 | 1 |
| real usage events | 287 | 12 |
| real messages | 167 | 18 |

As `zooka_runtime`:

| test | result | reading |
| --- | --- | --- |
| no tenant context, any table | **0 rows** | fails closed, six tables checked |
| context A, own rows | 25 / 16 / 287 / 167 | exactly A's real counts |
| context A, rows belonging to B | **0 / 0 / 0 / 0** | no leakage |
| A reads its own `Organization` row | 1 | |
| A reads B's `Organization` row | **0** | |
| A reads a specific B chat by id | **0** | |
| A reads a specific B message by id | **0** | |
| A updates B's chat | **UPDATE 0** | |
| A deletes B's chat | **DELETE 0** | row still present afterwards |
| A inserts a chat into B | **refused**: new row violates row-level security policy | |
| rows written by the probe | **0** | |

Totals across both tenants match the loaded data exactly (66 chats, 319 messages, 23 documents, 372 usage events), so nothing was hidden by the filters and nothing appeared twice.

## What this does and does not establish

**Established:** with the real role, the real policies and real customer rows, a tenant sees exactly its own data, cannot read, update, delete or insert into another tenant's, cannot lift RLS, cannot create objects, cannot become the owner role, and cannot touch bootstrap tables. That is the behaviour the production switch is supposed to produce.

**Not established:** that production enforces it *today*. It does not: the app connects as the owner role, and B4 keeps the tenant runner away from production. What is missing is not a guarantee, it is the switch and the decision behind it.

**Also not established:** concurrency under the pooler, and behaviour under load. Both need the switch.
