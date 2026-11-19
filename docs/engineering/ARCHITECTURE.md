# ZOOKA-AI — Architecture as it actually exists

Not a target diagram: what is in `main` today, verified by reading the code.

## Runtime

- Next.js (App Router) on Vercel, project `chatbot`, domain `zooka-ai.com`.
- Postgres via Drizzle ORM. Production is one Supabase project; the sandbox
  cannot reach it directly (port blocked), only through app routes.
- Auth: NextAuth with Google OIDC; workspace context resolved server-side
  (`lib/auth/workspace`). No supabase-js in the app.
- Agent runtime: n8n bridge (`/api/agent`) plus in-app tool loop; tools are
  activated from the registry, not a hand-written list.
- Media: job queue with HMAC-signed webhook to n8n, results polled by the UI.

## Boundaries that exist in code

| Boundary | Where | Enforced how |
|---|---|---|
| Tenant | `organizationId` on every query | server-side scope, never from the request body |
| Credentials | `integration_connection` | AES-256-GCM, per workspace, never returned to the client |
| Actions | `lib/agents/approvals.ts` | sensitive steps need a decision row; unattributed decisions refused |
| Usage | `usage_counter` caps | counted per workspace per provider before the call |
| Audit | `integration_audit`, `AgentDecision` | append-only rows written by the executor |

## Gaps that matter

1. The HTTP layer for approval decisions is not written (the engine is). It needs
   a verified Drizzle->executor link, which needs a live database. Shipping an
   unverified adapter would be the one thing worse than a missing route.
2. Commander has no UI. Any UI showing `RUNNING`/`VERIFIED` without a real run
   behind it would violate the operating rule, so it waits for Stage 3.
3. Preview has no database and no backup token, by design. That is isolation
   working, not a defect.
