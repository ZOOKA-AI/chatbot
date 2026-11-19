# Operating a self-hosted install

## Health

| Signal | What it answers | Where |
|---|---|---|
| `GET /api/health` | is the web process serving | HTTP, no auth |
| `GET /api/agents/health` | queue depth, stalled leases, failure bursts, last scheduler pass | HTTP, owner/admin session |
| `scripts/selfhost/healthcheck.ts` | can this container reach the database | exit code |
| `AgentExecution` rows | what actually ran, with evidence | SQL |

The authenticated endpoint returns 503 when the verdict is critical, so an uptime monitor
that only understands status codes still sees a real outage rather than a 200 with bad news
inside.

## Alerts

`lib/agents/alerts.ts` derives alerts and deduplicates them: a warning repeats every 6 hours
at most, a critical every hour, an escalation is sent immediately, and a recovery is reported
once. Delivery happens **only** when `ALERT_WEBHOOK_URL` is set; with the variable empty,
nothing is sent anywhere. That default is deliberate: an installer should not discover they
have been posting to a stranger's webhook.

Point it at any endpoint that accepts JSON:

```bash
ALERT_WEBHOOK_URL=https://helmyharoon817979.n8n-wsk.com/webhook/zooka-alerts
```

## Backup

```bash
DATABASE_URL=postgres://zooka:...@localhost:5432/zooka \
STORAGE_LOCAL_DIR=/var/lib/docker/volumes/zooka_storage/_data \
BACKUP_DIR=/srv/backups \
deploy/scripts/backup.sh
```

The script takes a `pg_dump -Fc` and a tar of the storage volume with the **same timestamp**,
then verifies the dump by listing its table of contents, and refuses to finish quietly if
there is no table data. Retention defaults to 14 days.

Run it nightly from the host's cron, not from a container: a backup that only exists inside
the thing it backs up is not a backup.

## Restore

```bash
FORCE=0 deploy/scripts/restore.sh /srv/backups/20261116T010000Z postgres://zooka:...@scratch:5432/zooka_check
```

It refuses a non-empty target unless `FORCE=1`, restores with `--exit-on-error`, unpacks the
files, and prints table and user counts. Practise this on a scratch database: the first time
you run a restore should not be during an incident.

## Recovery scenarios

**A worker died mid-task.** Nothing to do. Its lease expires and the scheduler reclaims it
before the next dispatch. Watch `docker compose logs scheduler` for `reclaimed`.

**The scheduler is down.** Work queues and nothing executes. No data is lost: `AgentTask`
rows stay `pending`. Restarting the scheduler drains the backlog at
`SCHEDULER_BATCH_SIZE` per pass.

**The database is gone.** Restore the newest verified dump, then unpack the matching storage
archive. Tasks that were `running` when the dump was taken come back as `running` with an
expired lease, and the scheduler fails them after the attempt ceiling rather than leaving
them stuck.

**A model provider is rate-limiting.** Executions record the provider error. Raise
`SCHEDULER_GLOBAL_LIMIT` only if the provider can take it; otherwise lower
`WORKER_CONCURRENCY` and let the queue absorb the wait.

## Logs

Every process logs one JSON object per line with `service`, `event` and timing. That is
enough for `docker compose logs | jq` and for any log shipper, without a logging SDK:

```bash
docker compose logs -f worker | jq -c 'select(.event=="task_finished")'
```

## Cost

Nothing here calls a paid service by default. The only recurring costs are the machine and,
if you choose to use one, a hosted model provider.
