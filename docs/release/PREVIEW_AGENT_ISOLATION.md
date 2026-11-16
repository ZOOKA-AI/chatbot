# Preview Agent Isolation and Hosted Acceptance

Date: 2026-11-16 (Asia/Dubai)
Branch: `release/rc-1`
Commits: `b2e9210` (harness fixes, preview account) → `21c9de5` (preview-only agent override, persistence measurement)

## Why this exists

Preview returned `503 agent_not_configured` on `POST /api/agent` because the
Preview scope carried no agent secret, and the production value is encrypted and
production-scoped. Pointing Preview at the production value would have widened a
production secret and let acceptance traffic reach the live agent webhook. Both
were refused.

## Isolated test webhook (n8n)

| Item | Value |
| --- | --- |
| Workflow | `ZOOKA Preview Agent — Isolated Test Webhook` — `9xwcP5HZmRxgW0hx` (active) |
| Path | `POST https://helmyharoon817979.n8n-wsk.com/webhook/zooka-preview-agent-test` |
| Auth | `httpHeaderAuth` credential `L8TXQzEfM18LrDhq` (`ZOOKA Preview Agent Guard`, header `x-solas-key`) |
| Behaviour | Echoes the incoming message, returns `{ok, steps, provider, reply}` |
| Side effects | None: no model call, no database, no external service, no tool, no production action |
| Verified | with key `200` → `{"ok":true,"steps":1,"provider":"n8n-preview-test",...}`; without key `403` |

The shared secret is generated locally (32 chars), stored in the agent vault as
`logins_index.preview_agent_webhook_key` and in `.preview_agent_key`; it is never
printed and never committed.

## Preview-only configuration

Added on the Vercel `chatbot` project, target `preview` only:

- `AGENT_WEBHOOK_URL_PREVIEW` → the isolated test webhook above
- `AGENT_WEBHOOK_KEY_PREVIEW` → the preview secret (encrypted)

`app/api/agent/route.ts` now reads `AGENT_WEBHOOK_URL_PREVIEW` and
`AGENT_WEBHOOK_KEY_PREVIEW` first, falling back to the production pair. The
production `AGENT_WEBHOOK_KEY` record still has `target: ["production"]`; no
production value was read, re-used or widened. Preview holds 15 variables,
production 56 (unchanged).

## Hosted acceptance — six journeys

Run against `https://chatbot-git-release-rc-1-zooka-ai1.vercel.app` (deployment
`chatbot-6874fz794`, commit `21c9de5`, `READY`) using the Vercel automation
bypass and the dedicated Preview account. Report:
`acceptance/hosted-journeys-rc1-d.json`.

| Journey | Result | Evidence |
| --- | --- | --- |
| Registration | PASS (page) | `/register` 200, renders email + password fields |
| Login | PASS | session established through `/api/auth/callback/credentials` |
| Session persistence | PASS | same user across two session reads 2s apart |
| Chat | PASS | `/workspace/agent` 200 with session; anonymous `/api/agent` 405 |
| Agent execution | PASS | `POST /api/agent` 200 from the isolated webhook; `AgentMessage` 0 → 2 rows, probe row and assistant reply both written |
| Logout | PASS | session empty after signout; `/workspace/agent` 307 to login |

6/6 passed. Persistence is measured in the database, not inferred from a status
code.

## Registration: remaining manual step

The registration form is a client-side handler over a server action, so scripted
submission is not available: three HTTP encodings of the action (progressive
form field, `Next-Action` with plain fields, `Next-Action` with indexed fields)
all returned `500`, and the automation layer cannot press the submit button.
Proof of the login side is complete, because the Preview account authenticates
through the real NextAuth credentials flow.

Manual step: open
`https://chatbot-git-release-rc-1-zooka-ai1.vercel.app/register?x-vercel-protection-bypass=<vault value>`
and submit one registration to close this single gap.

## Migration preflight recheck

- 51 up files, 22 down files, 44 in `pending/`
- duplicate number groups `0014`, `0015`, `0016`, `0017`, `0027` (knowingly journaled that way; never run `pnpm db:migrate`)
- `0017` exists twice by design (`base44_agent_session`, `client_projects`); `0027` present with its down file
- `0050` absent from `release/rc-1` (billing isolation holds)
- 10 destructive down files, all 10 guarded (`RAISE` / row count / `to_regclass`)
- highest migration `0049`
- `scripts/selfhost/migrate.ts` still refuses both production hosts

## Safety state

- Production deployment untouched: `chatbot-4kzjorjfe` `READY` on `19473c0`
- No production migration applied, no merge into `main`, PR #98 stays Draft
- No live payment path activated; `lib/billing/{ledger,guard,payments,config}.ts` and `0050_billing_ledger` exist only on `feat/uae-billing`
- rc-1 billing tests: `billing-security` + `billing-webhook-safety` = 10 passed
- No secret value appears in this document, the report, or any commit
