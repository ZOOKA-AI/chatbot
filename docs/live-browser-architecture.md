# Live Browser — architecture and cost review

Status: **design only. No browser service is enabled, no paid plan is active, no
spend has been made.** This document exists so the build can start immediately
after an explicit decision on cost.

## What the feature must do
A workspace user asks the agent to act on a site the API does not cover: open a
page, read it, fill a form, click a control, and report evidence. The user must
be able to watch what happens and must approve anything that spends, publishes or
sends.

## Architecture (fits the existing app, no new hosting)

1. **Session broker** — `POST /api/browser/sessions` (owner or admin only) creates
   one session row: `organizationId`, `userId`, `provider`, `status`,
   `expiresAt`, `approvalId`. One session serves one workspace; the session id is
   never reused across workspaces.
2. **Isolation** — the browser context is per session (fresh cookies, no shared
   profile). The stored artifacts (screenshot, DOM snapshot, console log) are
   written under the workspace prefix, exactly like other workspace files, so
   existing scoping and signed-URL rules apply unchanged.
3. **Step runner** — a deterministic action list (`navigate`, `click`, `type`,
   `read`) executed server-side. Every step writes an `AgentStep`-style record
   with the selector used, the result, and a screenshot hash. The model proposes
   steps; it never executes free-form JavaScript.
4. **Approval gate** — any step flagged `sensitive` (submit, purchase, publish,
   delete, send, permission change) stops the run and opens an approval through
   the existing approvals engine (`lib/agents/approvals.ts`), which already
   enforces pending-only, 24h expiry and a durable decision log. The run resumes
   only on `approved`; `rejected` and `expired` terminate it.
5. **Audit** — every session and step is appended to the same audit path used by
   integrations, so "who made the browser do what" is answerable.
6. **Kill switch** — a workspace-scoped flag plus a global env flag. When set, new
   sessions are refused and running ones are cancelled at the next step boundary.

## What must never happen
- A session acting on a site with credentials typed into chat.
- A step that pays, publishes or sends without an approval row in `approved`.
- One workspace reading another's screenshots or session log.
- Free-form JS evaluation from model output.

## Cost review (the decision this document is waiting for)

The only real cost is a hosted browser provider, billed per browser-hour plus
session overhead. Three routes:

| Route | Shape of the cost | Assessment |
|---|---|---|
| Hosted provider API (what this agent already uses for its own browsing) | per browser-hour, billed while a session is open | Simplest and matches the architecture above; needs the provider's current price list checked at decision time, not quoted from memory |
| Self-hosted Chromium next to the app | fixed compute, always on | Cheapest at high volume, but our current hosting is serverless with short function limits, so it would need new infrastructure — rejected for now because it conflicts with "no new hosting" |
| Provider-free | none | Not viable: any real page automation needs a browser |

Guardrails that keep the bill bounded, and that would ship with the feature:
1. a hard per-workspace monthly browser-minute cap, enforced before a session starts;
2. idle timeout (session closes on inactivity, not on a timer);
3. a max steps per run;
4. refusal when the cap is exhausted, with an upgrade path — never a silent overage;
5. the kill switch above.

**Nothing here is enabled.** Turning it on requires: an explicit budget decision,
a provider key set as a secret (never in chat), and the cap constants approved.

## Build order once approved
1. Session row + scoped file storage + kill switch (no provider yet, fully testable).
2. Step runner and step records against a provider in a sandbox workspace.
3. Sensitive-step approval gate wired to the approvals engine.
4. The watch surface (live screenshot + step list) behind a preview flag.
