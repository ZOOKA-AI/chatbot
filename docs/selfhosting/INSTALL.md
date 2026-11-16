# Installing ZOOKA-AI on your own infrastructure

Assumes Docker with the Compose plugin, and nothing else. No account with any AI provider
is required if you run a model locally (see [PROVIDERS.md](PROVIDERS.md)).

## 1. Get the code

```bash
git clone https://github.com/ZOOKA-AI/chatbot.git zooka
cd zooka
git checkout main          # or the tag you intend to run
```

## 2. Configure

```bash
cp deploy/.env.selfhost.example deploy/.env.selfhost
```

Two values are mandatory:

```bash
openssl rand -base64 24    # → POSTGRES_PASSWORD
openssl rand -base64 32    # → AUTH_SECRET
```

Set `PUBLIC_URL` to the address people will actually use. It appears in file URLs and
callback links, so `localhost` here means links that only work on the server.

## 3. Start

```bash
cd deploy/compose
docker compose --env-file ../.env.selfhost up -d --build
```

The stack starts PostgreSQL, runs `migrate` to completion, then starts `web`, `worker` and
`scheduler`. First build takes a few minutes; later starts are seconds.

```bash
docker compose ps
docker compose logs -f migrate      # should end with {"applied":[...],"failed":{}}
```

Open `PUBLIC_URL`. A healthy install answers `GET /api/health` with 200 without a session.

## 4. Prove it is actually working

Creating an account and a task from the UI is the real test. From a shell, the same check
without a browser:

```bash
docker compose exec postgres psql -U zooka -d zooka -c \
  'select status, count(*) from "AgentTask" group by 1'
docker compose logs --tail=20 scheduler   # one pass line per interval
docker compose logs --tail=20 worker      # task_started / task_finished lines
```

A worker that logs `worker_started` and then nothing is normal *when the queue is empty*.
Silence with a non-empty queue is not: check `SCHEDULER_GLOBAL_LIMIT` and the scheduler log.

## 5. Scale

```bash
docker compose up -d --scale worker=4
```

Workers coordinate through the database, so this needs no other change. Set
`WORKER_CONCURRENCY` to roughly the cores you are willing to give each one.

## 6. Put it behind TLS

Either put Coolify/Caddy/nginx in front of port 3000 (see `deploy/coolify/README.md`), or
set `PUBLIC_URL` to the https address and terminate TLS at the proxy. Do not expose
`postgres`, `worker` or `scheduler` to the internet.

## Coolify

One-click-ish: `deploy/coolify/README.md`, using `deploy/compose/docker-compose.coolify.yml`
which removes the host port bindings.

## Upgrading

```bash
git pull
cd deploy/compose && docker compose --env-file ../.env.selfhost up -d --build
```

`migrate` runs first and a failure stops the stack, so a version never runs against a schema
it does not understand.

## Uninstalling

Data lives in the `postgres-data` and `storage` volumes. `docker compose down` removes the
containers and keeps the data; `docker compose down -v` removes the data too, and there is no
undo for that.
