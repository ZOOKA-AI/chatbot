# Deploying on Coolify

Coolify runs the same `docker-compose.yml`. There are three things to get right, and they
are all about the proxy rather than about the app.

## 1. Create the resource

1. **+ New** → **Docker Compose** → *Empty* (or point it at this repository with the
   compose file path `deploy/compose/docker-compose.yml`).
2. Paste the contents of `../compose/docker-compose.yml`.
3. In **Environment Variables**, paste everything from `../.env.selfhost.example` and fill
   `POSTGRES_PASSWORD` and `AUTH_SECRET`.
4. Set **Domains** for the `web` service only, e.g. `https://zooka.example.com`, port
   `3000`.

## 2. Do not publish the other services

Only `web` should have a domain. `postgres`, `worker`, `scheduler`, `migrate` and `minio`
must stay on the internal network. If Coolify suggests a domain for them, decline it: a
database with a public hostname is the most common way a self-host becomes somebody
else's.

`deploy/compose/docker-compose.coolify.yml` is the same stack with the host port bindings
removed. Use it when Coolify's proxy is in front, so nothing is reachable by IP on the
host either.

## 3. Set a real `PUBLIC_URL`

`PUBLIC_URL` must match the domain Coolify assigned, including the scheme. It is used to
build file URLs and callback links; a mismatch produces links that resolve to
`localhost` for other people.

## Upgrades

```bash
docker compose pull          # if you build images elsewhere
docker compose up -d --build # rebuild from source
```

`migrate` runs before `web`, `worker` and `scheduler` because they depend on it with
`condition: service_completed_successfully`. A failed migration stops the stack instead of
letting a new version run against an old schema.

## Scaling

Coolify does not scale compose services. For more workers, run the stack twice against the
same database with `scheduler` disabled in the second stack
(`docker compose up -d --scale scheduler=0`), or move `worker` to its own compose file.
Workers coordinate through the database, not through the orchestrator.
