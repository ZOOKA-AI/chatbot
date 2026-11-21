# TikTok publishing — release package (#065)

Status: **BLOCKED on TikTok app approval and on owner configuration.** Nothing in
this document has been deployed to production, and no migration has been applied
to any shared or production database.

## What exists in code (verified)

| Layer | State |
|---|---|
| Authorize route | Redirects to `https://www.tiktok.com/v2/auth/authorize/` with `user.info.basic` and `video.upload` only. Direct Post is deliberately not requested. |
| PKCE | S256, verifier generated with 48 random bytes and carried inside the signed state cookie. |
| State | HMAC over `organization:user:nonce:verifier:issuedAt`, 600s server-enforced lifetime, 60s future skew, constant-time compare, bound to the signed-in session. |
| Callback | Verifies the cookie (never the query string), exchanges the code, reads the account, stores tokens. |
| Token storage | AES-256-GCM through the cipher already vetted in this repo. No token appears in any response. |
| Refresh | Serialised per workspace+user (single flight) because TikTok rotates the refresh token; a second parallel refresh would be told `invalid_grant` and believing that disconnects the creator. |
| Revocation | Disconnect calls `/v2/oauth/revoke/` before deleting the row. |
| Upload | `video.upload` → the video lands in the creator's own inbox. `Content-Range` carries the real file total. |
| Queue | `TikTokPublishJob` (0065) with RLS, membership policy, unique `(organizationId, jobKey)`, lease-based claim, attempt cap of 3. |
| Drain endpoint | `POST /api/integrations/n8n/tiktok/run`, authenticated by `N8N_WEBHOOK_SECRET` in constant time, tenant-pinned transaction, SSRF-guarded media fetch. |

## Why n8n does not hold tokens

A creator's access token is encrypted per user and only the application can
decrypt it. If n8n called TikTok directly it would have to hold that token, and
every execution log would then contain a live credential. So n8n posts an
organization id, and the server uploads with each owner's own token. The only
credential n8n holds is the shared secret, which grants nothing beyond "drain
this workspace's queue".

## Configuration required before anything can run

None of these exist in the Vercel `chatbot` project today (75 variables checked,
zero matching `TIKTOK`):

- `TIKTOK_CLIENT_KEY` — from the TikTok app, after it exists
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_STATE_SECRET` — random 32+ bytes, signs the OAuth state
- `TIKTOK_REDIRECT_BASE_URL` — `https://zooka-ai.com`
- `TOKEN_ENCRYPTION_KEY` — the TikTok store refuses to save without it, so
  connect would fail silently today

`N8N_WEBHOOK_SECRET` already exists in production.

## Migration plan

1. Merge only after the owner accepts that merging `main` deploys production.
2. `POST /api/admin/migrate` with the migration token: 0063 (platform roles),
   0064 (TikTok tables), 0065 (publish queue).
3. Confirm `failed={}` and read the applied list back.
4. Verify `rls_on` for `TikTokConnection`, `TikTokUpload`, `TikTokPublishJob`.

Order matters only in that 0064 must precede 0065, which the numbering enforces.

## Rollback plan

Each of 0063, 0064 and 0065 ships a `.down.sql`. The 0064 and 0065 rollbacks
carry a forward-only guard: they refuse to drop a table that still holds rows, so
a rollback cannot silently destroy a queued post or a creator's connection. Clear
the rows deliberately first if a rollback is genuinely intended.

## Security checklist

- [x] RLS on all three TikTok tables, membership guard in every policy
- [x] `userId` foreign key with cascade on delete
- [x] Tokens encrypted at rest, never returned in a response
- [x] State signed, expiring, session-bound, replay-resistant
- [x] PKCE S256
- [x] Refresh rotation single-flighted
- [x] Revocation on disconnect
- [x] Shared-secret drain endpoint, constant-time compare, fail-closed when unset
- [x] Media URL guard: https, no credentials, no non-443 port, no IP literal, no
      private address, re-checked after redirects
- [ ] Rate limiting on the drain endpoint (not implemented; n8n is the only
      caller and the attempt cap bounds retries)
- [ ] Audit log beyond `TikTokUpload` rows (not implemented)

## Deployment checklist

1. Owner approval for merge (merge deploys production).
2. Apply migrations in order, read back `failed={}`.
3. Set the five variables above in Vercel, redeploy.
4. `/api/integrations/tiktok/status` should report `configured: true`.
5. Connect one real creator account and confirm the row lands in
   `TikTokConnection` with ciphertext, not plaintext.
6. Queue one job with a small video and confirm it reaches the inbox.
7. Only then activate the n8n workflow `8boNVVPT8rK0cO5I`.

## Smoke tests

- `POST /api/integrations/n8n/tiktok/run` with no secret → 401
- with a one-character-short secret → 401
- with the secret and no `organizationId` → 400
- with `N8N_WEBHOOK_SECRET` unset → 500, never an unauthenticated run

## Monitoring plan

- `TikTokPublishJob` rows stuck in `CLAIMED` past the 10-minute lease
- jobs whose `attempts` reached 3
- `TikTokUpload.status = FAILED` with `failReason`
- n8n execution list for workflow `8boNVVPT8rK0cO5I`

## Known limits, stated plainly

- No live OAuth and no live upload has been performed: there is no ZOOKA-AI
  TikTok app, so there is no client key to test with. `video.publish` (Direct
  Post) is not requested, and TikTok's own guideline that apps for private or
  internal use are not eligible for approval still governs whether an app is
  approved at all.
- The queue is drained on demand. There is no cron inside the application; the
  scheduler is n8n, by design.
