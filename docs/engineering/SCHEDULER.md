# Scheduler

One HTTP call does one bounded pass of work. Nothing lives in memory between
passes, because nothing on this platform keeps a process alive between requests.

## Hosting requirements

| Requirement | Why | Failure if absent |
|---|---|---|
| A cron that POSTs `/api/agents/scheduler` | No persistent worker exists; the queue only moves when something calls it | Tasks stay `pending` for ever |
| `SCHEDULER_TOKEN` in the deployment secrets | Authorises the pass, compared in constant time | Endpoint answers 401 (`missing token` closes it, never opens it) |
| `DATABASE_URL_PLATFORM` | Selection happens across tenants; the runtime role cannot see other workspaces | 503 `platform_connection_required` |
| A cron frequency that fits `SCHEDULER_BATCH_SIZE` | One pass only takes so much | Queue latency, not loss |
| `SCHEDULER_PER_ORG_LIMIT`, `SCHEDULER_GLOBAL_LIMIT`, `SCHEDULER_BATCH_SIZE` | Bound each pass so it always finishes inside the request limit | Defaults apply (1, 2, 2) |

Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`, which this endpoint
accepts; set `SCHEDULER_TOKEN` to the same value. Any other scheduler may send
`x-scheduler-token` instead. A pass runs at most `batchSize` tasks with a 300 s
function limit, so the ceiling must keep one pass comfortably inside it.

**The platform connection is the one credential that can see across tenants.**
It is used only for queue selection and the `SchedulerRun` record. Everything that
touches a workspace's data runs inside that workspace's transaction as
`zooka_runtime`. It refuses production hosts outright, so a preview cannot reach
across tenants in the real database.

## Order of a pass

1. Take the advisory lock; if it is held, return `overlapping_run` and do nothing.
2. Repair: close attempts whose lease expired and fail their tasks.
3. Count what is running; if the global ceiling is reached, record `idle` and stop.
4. Select fairly: one task per workspace per pass, oldest first.
5. For each task, enter that workspace's transaction, find its agent identity, run.
6. Write the `SchedulerRun` row and release the lock.

## What is not implemented

No cron is configured anywhere yet: the endpoint exists and is tested, but
nothing calls it on a schedule. There is no per-workspace scheduler UI, no
priority ordering beyond age, and no backoff schedule beyond the worker's
attempt ceiling.
