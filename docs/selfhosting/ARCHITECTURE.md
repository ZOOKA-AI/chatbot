# Self-hosted architecture

Four processes, one database, no required vendor.

```
                    ┌──────────────┐
   browser ────────► │  web         │  Next.js: pages + REST API
                    │  (stateless) │  tenant scope per request
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  PostgreSQL  │  tasks, executions, leases, approvals, audit
                    └──▲───▲───▲───┘
                       │   │   │
        ┌──────────────┘   │   └───────────────┐
        │                  │                   │
 ┌──────┴───────┐  ┌───────┴──────┐  ┌─────────┴────────┐
 │  scheduler   │  │   worker     │  │  worker (n)      │
 │  1 process   │  │  1..n        │  │  horizontal      │
 └──────────────┘  └──────────────┘  └──────────────────┘
```

## Why these are separate

**Scheduler and worker** were one HTTP-triggered path on the hosted deployment: a request
came in, the scheduler claimed work and ran it. That is fine for a serverless platform and
wrong for a machine you own, because it makes execution depend on traffic. Here the
scheduler runs on a timer and the workers poll, so a quiet night still finishes the queue.

**Web is stateless** except for sessions signed with `AUTH_SECRET`. It can be restarted,
replaced or scaled without touching work in progress, because nothing about a run lives in
its memory.

## Ownership comes from the database

`AgentTask.status = 'pending'` is the queue. A worker claims one row with:

```sql
with candidate as (
  select id from "AgentTask" where status = 'pending'
  order by "createdAt" limit 1
  for update skip locked
)
update "AgentTask" set status = 'running' ...
```

`FOR UPDATE SKIP LOCKED` is why scaling workers is safe: two workers polling at the same
instant take different rows instead of blocking or duplicating. No orchestrator coordinates
them, so Docker Compose, Coolify, Kubernetes and a cron job on a VPS all behave the same.

## Leases, not promises

A running execution holds a lease (`leaseExpiresAt`) and the scheduler repairs expired ones
before dispatching anything. A worker that is killed mid-task:
1. stops heartbeating,
2. has its lease expire,
3. is reclaimed by the scheduler, and
4. is retried up to the task's attempt ceiling.

The failure mode this avoids is the most common one in self-hosted setups: a `kill -9`
leaves a row marked `running` forever and the queue silently dies behind it.

## Tenant isolation

Isolation is enforced by the database, not by the application:

- Commander tables carry `organizationId`, with RLS policies in `pending/0030`.
- `pending/0031` creates `zooka_runtime`, a login role that is not a superuser, cannot
  bypass RLS, cannot create objects and has privileges on those tables only.
- Setting `DATABASE_URL_TENANT` (and `TENANT_RLS_ENABLED=on`) routes tenant queries through
  that role inside an explicit transaction, so a query that forgets its workspace filter
  returns nothing rather than another workspace's rows.

The web process still needs a privileged connection for session lookups. Documented in
`docs/engineering/TENANT_ROLE_ROLLOUT.md`.

## What is replaceable, and how

| Concern | Default | Alternatives | Switch by |
|---|---|---|---|
| Database | bundled PostgreSQL 17 | any PostgreSQL 14+ | `DATABASE_URL` |
| Object storage | local disk volume | MinIO, S3, R2, B2, Vercel Blob | `STORAGE_DRIVER` + `S3_*` |
| Model provider | any OpenAI-compatible endpoint | Ollama, vLLM, LiteLLM, gateway, Anthropic, Google | `MODEL_PROVIDER`, `MODEL_BASE_URL`, `MODEL_ID` |
| Alert delivery | none (derived only) | n8n webhook, Slack, Gotify, Uptime Kuma | `ALERT_WEBHOOK_URL` |
| Reverse proxy | Docker's published port | Coolify/Traefik, Caddy, nginx | `deploy/coolify/` |

## Resource controls, not application limits

There is no hardcoded ceiling on how much work the platform will do. What exists is what an
operator sets:

| Variable | Meaning | Default |
|---|---|---|
| `WORKER_CONCURRENCY` | tasks in flight per worker process | 2 |
| `SCHEDULER_GLOBAL_LIMIT` | executions allowed across all workspaces | 10 |
| `SCHEDULER_PER_ORG_LIMIT` | executions allowed per workspace | 5 |
| `SCHEDULER_BATCH_SIZE` | tasks one scheduling pass considers | 10 |
| `WORKER_LEASE_MS` | how long a claim is valid without a heartbeat | 120000 |
| `DATABASE_POOL_SIZE` | connections per process | 10 |

A single machine with 16 cores sets `WORKER_CONCURRENCY=14` and
`SCHEDULER_GLOBAL_LIMIT=40`; nothing in the code argues with that.
