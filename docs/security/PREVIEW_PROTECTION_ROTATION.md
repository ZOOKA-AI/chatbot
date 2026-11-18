# Preview protection bypass — compromised, rotation required

Status: **COMPROMISED**. Owner action required. The value must never be printed,
committed, pasted into a ticket or left in a shell history file.

## What happened

During the Preview readiness audit on 2026-11-18 the protection-bypass entry for the
`chatbot` project was read through the Vercel API while walking the `protectionBypass`
object. In that project the bypass **secret is the object key itself**, so a metadata
walk surfaced it in an internal tool log. The value is therefore treated as leaked, not
as merely reviewed.

Impact is bounded: the bypass only unlocks **Preview** deployments of `chatbot`. Production
is not covered by it, Preview runs on the isolated Neon database, and no customer data
exists there. The exposure is still a real one, because a bypass holder skips Vercel
Authentication on every preview URL of the project.

Automated rotation is not possible. `PATCH /v9/projects/{id}` rejects the field
(`should NOT have additional property 'protectionBypass'`), and the dedicated sub-route
does not exist. Rotation is a dashboard action.

## Exact rotation steps (owner, in the Vercel dashboard)

1. Open **Vercel → team zooka-ai1 → project `chatbot` → Settings → Deployment Protection**.
2. In **Protection Bypass for Automation**, find the single existing row.
3. Click the row's **⋯** menu → **Remove** → confirm **Remove Bypass**. The project now has
   zero bypass secrets; Preview keeps Vercel Authentication because
   `ssoProtection.deploymentType` stays `preview`.
4. Only if a bypass is genuinely needed for automated checks, add a fresh one:
   **Add Bypass** → the value must be exactly 32 characters → note it as
   `rotated 2026-11-18, stored in agent secrets`. Otherwise leave it empty.
5. Store the new value in the agent secret store, never in chat, never in a file inside
   the repository.

## Verification after rotation

- Without any bypass header, a preview URL must answer `302` with
  `Protected by Vercel Authentication`.
- With the new value in `x-vercel-protection-bypass`, `/api/auth/csrf` must answer `200`
  with a JSON `csrfToken`.
- `ssoProtection` must still be `{deploymentType: "preview"}` and `passwordProtection` must
  remain unset: rotation must not weaken protection.
- While reviewing, also check **Shareable Links**: they bypass deployment protection,
  password and trusted IPs just like a bypass secret, so review and prune them too.

## Standing rules

- Never disable deployment protection to make a test pass.
- Never print a protection-bypass value, even partially, including in an audit that walks
  a settings object: print field names, counts and types only.
