# Media callback and migration release contract

## Scope

This change is source work and isolated testing only. No production database,
credentials, n8n workflow, Hugging Face Space or provider was contacted or changed.
A READY deployment is not evidence of successful generation.

## Sender contract (must be implemented by the external generator)

- POST the exact UTF-8 JSON bytes to `/api/media-engine/callback`.
- Compute HMAC-SHA256 over those bytes using the shared
  `MEDIA_ENGINE_WEBHOOK_SECRET`. Put the lowercase 64-character hex digest in
  `x-zooka-signature`, without a `sha256=` prefix. Sign after final JSON
  serialization. Do not sign a parsed/reformatted object. Whitespace, Unicode
  encoding and trailing newlines change the signature.
- Send `Content-Type: application/json`. Maximum body size: 16 KiB.
- Use one of the following strict payload shapes, replacing the example UUID
  with the original dispatched job ID:

```json
{"jobId":"11111111-1111-4111-8111-111111111111","status":"running"}
```

```json
{"jobId":"11111111-1111-4111-8111-111111111111","status":"succeeded","assetUrl":"https://assets.example.test/output.mp4"}
```

```json
{"jobId":"11111111-1111-4111-8111-111111111111","status":"failed","error":"Provider failed"}
```

A success requires an asset URL. A failure requires a nonblank error of at most
500 characters. Do not include secrets or provider credentials in the error.
No additional keys are accepted. A running notification must omit asset/error.

## Asset policy

Configure `MEDIA_ENGINE_ASSET_HOSTS` on the receiving service as a comma-separated
list of exact trusted storage hostnames, without schemes, paths or wildcards.
An empty list fails closed for successful callbacks. Accept only HTTPS, no
credentials, fragments, alternate ports, IP literals or localhost. Subdomains
are not implicitly trusted. Set a stable storage host rather than a generic
user-content domain when possible. This validates the URL origin, not the file
contents, MIME type, ownership or availability; those checks still need real
provider/storage integration. No server-side asset fetch is performed here.

## Status and retries

Updates are a single conditional SQL statement:

- `queued -> running | succeeded | failed`
- `running -> succeeded | failed`
- `succeeded` and `failed` are immutable.

A repeated running callback, a late callback for a terminal job, or an unknown
job ID returns `200 {"ok":true,"ignored":true}` without writing. A successful
transition returns `ignored:false`. Jobs are never created by callbacks. This
also prevents dispatch-failure handling from overwriting a completed callback.

Missing server configuration returns 503; invalid signature 401; invalid body
or asset origin 400; oversized body 413; storage/internal failure generic 500.
Retry transient 5xx responses with backoff; do not retry invalid 4xx requests
without fixing them. The callback does not need a browser cookie; its exact
proxy exception delegates authorization to HMAC verification.

This contract has no timestamp/nonce. It protects body integrity and makes
completed-job replay a no-op, but is not general replay detection. Adding a
signed timestamp/nonce is a coordinated sender/receiver version change, not an
unannounced compatibility change. A compromised shared secret can forge valid
callbacks for nonterminal jobs; rotate it through the deployment/provider
configuration if exposed. Do not paste it into chat.

## Migrations: what was repaired

Drizzle reads `_journal.json`, not every numbered SQL file. A rename in ef57b1d
left its existing `0014_brief_sauron` entry pointing to a missing file. Restore
that original filename and bytes (same repair as PR #29), keeping its historical
hash/timestamp. It already contains WebhookEvent and the older integration tables;
do not register all standalone 0014–0018 files as new migrations.

The hand-written `0020_media_job.sql` was not in the journal or snapshots.
`drizzle-kit generate` produced registered `0015_media_job` and
`0016_media_job_index` migrations and snapshots from the real schema. The
registered numbers follow the journal, not the highest untracked filename.
Keep the old 0020 file as historical evidence, not a second manual release step.
The generated schema includes the organization/createdAt index from that SQL.

Tests use PGlite (isolated embedded PostgreSQL) to:

1. Load and apply the complete registered migration chain to an empty database.
2. Rerun the migrator and verify history entries are not duplicated.
3. Check WebhookEvent uniqueness and the MediaJob index.
4. Exercise running/terminal updates, duplicates and competing terminal writes.
5. Apply the old 0020 SQL twice on a fixture, then apply the generated MediaJob
   migrations to verify that particular legacy table shape is compatible.

These tests do not certify an unknown production schema or a hosted database's
network, roles, permissions or concurrent connection behavior. PGlite runs in
one process; real multi-connection testing is still required on staging.

## Production gate (not performed here)

1. Back up the intended database and confirm its identity. The migration runner
   selects DATABASE_URL before POSTGRES_URL and loads `.env.local`.
2. Read `drizzle.__drizzle_migrations` and inspect existing table/constraint/index
   definitions. Do not delete history or edit already applied SQL hashes.
3. Compare actual schema/history with the reviewed branch. If 0020 or other SQL
   was manually applied with different shapes, reconcile explicitly on staging.
4. Run the reviewed migrator on an isolated hosted staging copy and verify data,
   constraints, indexes and an end-to-end signed callback using a test asset.
5. Only after review and separate approval, apply production migrations from the
   reviewed checkout. Running isolated tests does not authorize this step.
6. Configure the generator and approved storage hosts, redeploy as appropriate,
   and test job dispatch -> signed callback -> status read -> asset rendering.

The external sender code was not supplied. Matching HMAC formats, credentials,
callback reachability and real generated assets remain unverified. Persistent
rate/concurrency limits, provider availability and billing are separate gates.

## Tested generator-side Node reference

`scripts/media-callback-sender.mjs` is a dependency-free reference for a trusted
Node worker. Importing the module performs no network request. The operator
must supply a fixed receiver URL and a secret from the worker's own environment;
never use a user prompt or an unverified dispatch body as callback configuration.
The generator must first authenticate incoming dispatch HMACs and create a real
asset. This module only sends status notifications; it does not generate media.

```js
import { sendMediaCallback } from "./scripts/media-callback-sender.mjs";

// Configure these yourself in the trusted worker; never print their values.
const config = {
  callbackUrl: process.env.ZOOKA_MEDIA_CALLBACK_URL,
  secret: process.env.MEDIA_ENGINE_WEBHOOK_SECRET,
};

// jobId must come from an authenticated job dispatch, not arbitrary user input.
await sendMediaCallback({ jobId, status: "running" }, config);
// Only after generation and upload to an approved storage origin succeed:
await sendMediaCallback({ jobId, status: "succeeded", assetUrl }, config);
```

The sender serializes once, signs the exact UTF-8 bytes, refuses insecure or
incorrect callback paths, caps payloads and uses a 15-second timeout. Redirects
are errors: a shared signing header must not be forwarded to another destination.
It accepts only the documented acknowledgement shape. It never logs secrets,
URLs or response bodies; the caller schedules bounded retries/backoff after
transient failures. A network timeout can follow a successful database update,
so retry the same payload rather than inventing a new job ID.

The integration test connects this sender to the real callback handler, the real
migration chain and real SQL state transitions in PGlite, then calls the real
GET handler with a test workspace. Only transport/auth/workspace lookup adapters
are in-process: the test verifies persisted success, ignored duplicate/late
failure, signature rejection and other-workspace 404. It does not verify a
hosted generator, DNS/TLS, Vercel protection, provider output or real file upload.
