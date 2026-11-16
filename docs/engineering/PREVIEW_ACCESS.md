# Vercel Preview access for verification

The blockers, the exact dashboard path, and where the secret goes.

## Why it is needed

Every preview URL answers `302` to `vercel.com/sso-api` with
`Protected by Vercel Authentication`. Automated verification cannot pass that
wall, and the platform API refuses to create a bypass:

| Attempt | Result |
|---|---|
| `PATCH /v6, /v8, /v9, /v10/projects/{id}` with `protectionBypass` | 400 `should NOT have additional property protectionBypass` |
| `POST/GET /v1/projects/{id}/protection-bypass` | 404 |
| guessing `x-vercel-protection-bypass` | still 302 |

So the key must be created once by the owner in the dashboard.

## Owner steps (2 minutes, reversible)

1. Vercel dashboard → team **zooka-ai1** → project **chatbot**.
2. **Settings → Deployment Protection**.
3. Find **Protection Bypass for Automation** → **Create / Generate**.
4. Give it a label such as `verify-91`. Set an expiry if the UI offers one —
   a week is enough.
5. Copy the value once, then store it where only this agent can read it:
   **Base44 → this agent → Secrets**, name `VERCEL_AUTOMATION_BYPASS`.
   Do not paste it into chat; a chat message is stored in transcripts.
6. Tell me "done" and nothing else.

## What I will do with it

- Send it as the `x-vercel-protection-bypass` header on requests to one preview
  deployment only, for the duration of the check.
- Verify: `cache-control`, `pragma`, `x-robots-tag`, `x-request-id`, 401 on a
  missing/wrong token, 405 on POST, and that no body carries a hash.
- **Not** disable deployment protection, **not** change any project setting,
  **not** print the key, **not** persist it in a file.
- Revoke instruction: dashboard → same panel → delete the bypass entry. I will
  confirm the preview returns 302 again afterwards.

## Expected result after access

Preview has **no** `BACKUP_TOKEN` and **no** `DATABASE_URL` (verified by listing
preview-scoped env names: only seven, none of them a database URL). So the live
preview can demonstrate the refusal path and the headers on 401, and a
`500 db_not_configured` for a correct token. A `200` on preview is *not*
expected and its absence is **not** a code defect — the 200 path is proved by the
loopback HTTP tests against a real Postgres engine with synthetic rows.
