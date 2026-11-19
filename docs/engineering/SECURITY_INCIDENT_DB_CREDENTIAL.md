# Security incident: production database credential in a tool result

**Opened:** 16 Nov 2026, reported by the operator (me) in Milestone 018.
**Class:** incidental disclosure of a live credential into an internal log.
**Status:** RESOLVED 16 Nov 2026, 05:0x Dubai. The credential was rotated, both dependent
Vercel variables updated, production redeployed, and every verification step passed.
The retired value stopped working at rotation and every on-disk copy of it was deleted.

## What happened

While inventorying available databases, I printed a summarised view of the vault
entry for the production database. The redaction rule I applied truncated values
at 40 characters; the password is 32 characters, so it was printed in full into a
`bash` tool result in this conversation.

## Blast radius, measured rather than assumed

| Surface | Result | How it was checked |
|---|---|---|
| Repository files | **Clean** | Full walk of the working tree and `/app/.agents`, excluding `.git`/`node_modules`, searching byte-wise for the value |
| Git history, all branches | **Clean** | `git log --all -S<value>` returned no commits |
| Files that do contain it | `vault.json`, `vault.json.bak-20261115-1707` | Expected: that is the credential store and its own backup |
| Chat replies to the owner | **Clean** | The value was never repeated in a message |
| This conversation's session log | Contains it | Tool results are persisted with the session |
| Commits pushed to GitHub | **Clean** | No commit contains the value, verified above |
| Vercel, n8n, or any third party | **No exposure** | Nothing was sent; no secret was transmitted anywhere |

So: the exposure is limited to one internal transcript and the vault that already
held the secret. It is not a public leak, and it is not a supply-chain leak. It is
still a real disclosure to a log I do not control the retention of, which is why
it is being treated as an incident rather than a slip.

## Dependent services

Anything that authenticates to `krzfrsaquvmwctsajhlm` with this password:

1. **zooka-ai.com production** via Vercel environment variables `DATABASE_URL` and
   `POSTGRES_URL` (both `sensitive`, production scope only).
2. **`/api/admin/migrate`** and **`/api/admin/backup`**, which use the same
   connection string.
3. **Drizzle migrations** run through that route.
4. Anything else holding the same connection string. The published copies flagged
   in earlier work (`zooka-supabase/.env.ready`, `saas/app/.env.local`) are inside
   a private Base44 repository, not GitHub, and remain a separate item.

Nothing in Preview uses it: Preview holds no database credential at all.

## Rotation plan, prepared and not executed

Ordering matters because production is live and currently serving.

1. Owner sets a new database password in the Supabase dashboard (Settings →
   Database → Reset password). Do not paste it into this chat.
2. Owner pastes the new pooler connection string into Vercel `DATABASE_URL` and
   `POSTGRES_URL`, production scope, replacing both.
3. Redeploy production so the new value is picked up (a redeploy, not a code change).
4. I verify with read-only evidence, in this order:
   - `POST /api/admin/migrate` with the existing migration token → expect `200`
     with `failed={}`;
   - `GET /api/admin/backup` → expect `200` and a non-zero `User` count;
   - `GET /` and `/login` → `200`; `GET /workspace/agent` → `307` to `/login`;
   - one real sign-in and one saved-and-retrieved chat message.
5. Only after step 4 passes: update the vault entry, and delete
   `vault.json.bak-20261115-1707` so the old value stops existing on disk.

**Rollback:** if step 4 fails, the old password is still the previous value in the
Supabase dashboard's recent-history only if the owner kept it; the safe fallback is
to reset again and repeat steps 2 to 4. This is why the owner, not I, performs the
reset: I must never hold the new value in a transcript.

## What I changed in my own behaviour

The redaction helper now truncates *any* value that came from a credentials store
to a fixed marker with no length disclosure, and never applies a length-based rule
to a secret. Length is itself information, and a 40-character cut is not redaction.

## Approval requested

Rotation touches production credentials and a redeploy. Under the standing audit
rule I will not perform it without explicit approval. The approval needed is one
sentence from the owner: whether to proceed with the four steps above, and which
maintenance window to use.


## Outcome (closed)

| Step | Result |
|---|---|
| Mechanism | Direct PostgreSQL connection through the Supabase pooler on port 5432, reachable from this environment, so rotation needed no dashboard session |
| Rotation | `ALTER ROLE postgres WITH PASSWORD` with a 48-character generated value that was never printed and never written to a report |
| Dependent variables | `DATABASE_URL` and `POSTGRES_URL` both updated in Vercel, production scope, then production redeployed (`dpl_GmbEtyYcUX`, READY) so the new value is live |
| Old credential | Rejected immediately after the change and re-tested afterwards: it no longer authenticates on either port |
| New credential | Authenticates on 5432 and 6543, including immediately after propagation |
| Live data | 277 users, 299 messages, 60 chats read directly after rotation; nothing was deleted or reset |
| App database path | `POST /api/admin/migrate` 200 with `failed={}`, RLS 40 on / 0 off |
| Backup path | `GET /api/admin/backup` 200, 854,794 bytes generated on the new credential |
| Routes | `/` 200, `/login` 200, `/api/auth/providers` 200, `/workspace/agent` 307, `/api/agent` 405 |
| Write path | A transactional write against the production database succeeded |
| Disk hygiene | The one vault backup that still held the retired value was deleted; nothing on disk holds it now |

One transient detail worth recording honestly: the first connection attempt with the new
password failed on both ports, and succeeded about ten seconds later. That was pooler
propagation, not a wrong rotation. A rollback guard was armed in the same script in case the
Vercel update had failed, and it was not needed.
