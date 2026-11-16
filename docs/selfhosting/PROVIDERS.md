# Swapping providers

Every choice below is read from the environment at process start. Nothing is compiled in,
and no vendor SDK is required for the self-hosted path.

## Database

Any PostgreSQL 14 or newer. `postgres:17-alpine` is in the compose file because it is the
version the migrations are tested against.

```bash
DATABASE_URL=postgres://user:pass@host:5432/zooka?sslmode=require
DATABASE_POOL_SIZE=10
DATABASE_SSL=require
```

Migrate a new database with:

```bash
docker compose run --rm migrate
```

The runner refuses hosts it recognises as ZOOKA-AI production unless
`ALLOW_PRODUCTION_DATABASE=yes` is set. That guard is there because this script will
eventually be pointed at the wrong database by somebody in a hurry.

## Object storage

`STORAGE_DRIVER` selects one of:

| Value | Needs | Use when |
|---|---|---|
| `local` (default) | a mounted volume | single machine, simplest |
| `s3` | `S3_BUCKET`, `S3_*` credentials | MinIO, AWS S3, Cloudflare R2, Backblaze B2, Wasabi |
| `vercel-blob` | `BLOB_READ_WRITE_TOKEN` | you already run on Vercel |

MinIO, included behind a profile:

```bash
docker compose --profile object-storage up -d
STORAGE_DRIVER=s3 S3_ENDPOINT=http://minio:9000 S3_BUCKET=zooka \
S3_ACCESS_KEY_ID=zooka S3_SECRET_ACCESS_KEY=... S3_FORCE_PATH_STYLE=true
docker compose run --rm migrate   # creates nothing; use mc to make the bucket
```

Signing is AWS SigV4, implemented in `lib/platform/storage.ts` with `node:crypto` so an
operator can audit it. Keys are validated before use: `..`, absolute paths and NUL bytes are
refused, and the local driver resolves every key and confirms it is still inside its root.

## Models

| `MODEL_PROVIDER` | `MODEL_BASE_URL` | Notes |
|---|---|---|
| `openai-compatible` | required, e.g. `http://host:8000/v1` | vLLM, LiteLLM, LM Studio, TGI, Groq |
| `ollama` | optional, defaults to `http://127.0.0.1:11434/v1` | local models |
| `gateway` | optional | the hosted Vercel AI Gateway, if you have it |
| `anthropic` / `google` | their native endpoint | their own wire format; not translated |

```bash
MODEL_PROVIDER=ollama MODEL_ID=llama3.1:8b
# or
MODEL_PROVIDER=openai-compatible MODEL_ID=qwen2.5-32b \
  MODEL_BASE_URL=http://127.0.0.1:8000/v1 MODEL_API_KEY=anything
```

An OpenAI-compatible endpoint is called with plain `fetch` (`lib/platform/models.ts`), so a
local stub can be used to test it and no SDK update can break it.

## Alerts

Any webhook that accepts `POST` with a JSON body: n8n, Slack incoming webhook, Gotify,
Uptime Kuma push. Empty means disabled.

## What still assumes a vendor

Stated plainly rather than hidden:

- **Authentication** uses the app's existing session mechanism (`AUTH_SECRET`); Google
  sign-in is optional and configured through the same provider settings as the hosted
  install. Email/password works without any external account.
- **`@vercel/blob`** remains an optional dependency for the `vercel-blob` driver. It is
  imported lazily, so a self-hosted install never loads it.
- **The AI SDK gateway** remains the default for the web chat path. `MODEL_PROVIDER` is what
  the worker and background execution use; pointing the interactive chat at a local model
  is a follow-up change in `lib/ai/providers.ts`, tracked in the ledger.
