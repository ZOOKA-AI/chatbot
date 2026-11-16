# ZOOKA-AI — Release Blockers (audit of `8cfb747`, 16 November 2026)

Blockers are ordered by what stops a customer, not by what is easiest. Each one names the evidence, the
minimum owner action, and the condition that closes it. Nothing here authorises a production action.

---

## B1 — The gateway is not deployed and cannot be (severity: release-stopping)

**Evidence.** `main = 19473c0d30`; GitHub contents API returns 404 for `lib/studio/gateway`,
`lib/studio/runcomfy.ts`, `lib/agents/worker-tools/studio-ai-generate.ts` on `main`; PR #95 is an open draft
at `8cfb747` with 323 files.

**What it means.** Every capability audited here exists in a branch. A customer on `zooka-ai.com` sees none of
it. No amount of local testing changes this.

**Minimum action.** A protected, reviewed merge of PR #95 to `main` and a deployment. Both are production
actions and are forbidden in this directive; they need the owner's explicit decision.

**Closes when.** `main` contains the gateway and the deployed build reports it.

---

## B2 — No provider credential exists, so no AI generation is possible (release-stopping)

**Evidence.** `runcomfyGatewayProvider.readiness()` → `credential_missing`; `falGatewayProvider.readiness()`
→ `credential_missing`; no `RUNCOMFY_API_TOKEN` and no `FAL_KEY` in any environment used for this audit.

**What it means.** The adapters are complete and refused. There is no path from a customer request to a
generated image, because the product holds no key.

**Minimum owner action.** Enter `RUNCOMFY_API_TOKEN` (or `FAL_KEY`) through the agent's secret form. Never in
chat. One vendor is enough to prove the line; both is better because the router can then compare cost.

**Closes when.** `/api/studio/gateway` reports `ready` for that provider and its model count is non-zero.

---

## B3 — Financial approval is a string, not a consumable record (security)

**Evidence.** `approvalReference` is checked for emptiness only (`lib/studio/cloud-cost.ts`,
`lib/studio/gateway/router.ts`). The durable `AgentApproval` / `AgentDecision` tables and the atomic
`decideApproval` engine exist but are not used by the studio spend path.

**What it means today.** With `PAID_GENERATION_ENABLED=false`, exposure is zero. The moment the switch is
turned on, one approval string can authorise unlimited jobs, never expires, is not bound to tenant, project,
provider, model or amount, and two concurrent actions with the same string both pass.

**Minimum action (engineering, no owner decision needed).** Record the approval as an `AgentApproval` row
(tenant, user, project, provider, model, operation, max cost, expiry, status, idempotency key) and consume it
atomically before submit, so a second job with the same key is refused by the database rather than by hope.

**Closes when.** A test proves that reusing an approval is refused and that an expired approval is refused.

---

## B4 — Seventeen pending migrations block safe deployment (release-stopping)

**Evidence.** `lib/db/migrations/pending/*.sql` = 34 files (17 up/down pairs), including `0043_browser_sessions`
and `0044_studio_media`, against 28 applied files on `main`.

**What it means.** Deploying the code before the schema reproduces exactly the drift already measured on this
project (`User.name`, `Organization.slug`, `Chat.deletedAt`, `Document.embedding` existed in production and
not in the migrations). The reverse order is worse.

**Minimum action.** A reviewed apply of the pending migrations in one ordered batch, with a verification query
per table, on a non-production database first. Production migration is forbidden in this directive.

**Closes when.** The pending set is empty and the verification queries pass on a database that mirrors
production.

---

## B5 — The live end-to-end chain is not covered by the quality gate (assurance)

**Evidence.** The six skips are `E2E_LIVE`, `ZOOKA_TEST_DOMAIN_LIVE` and `WORKER_LIVE` gated suites. The gate
that "passes twice" never exercises queue → worker → real GitHub/Vercel → evidence.

**What it means.** Green gates prove the code paths with fakes. They do not prove the chain works against the
outside world, and a regression in credential handling or network use would pass unnoticed.

**Minimum action.** Run the live suites once, deliberately, with the owner's credentials present, and record
the output as release evidence. Not a gate change.

**Closes when.** One recorded live run of the chain exists with its artefacts.

---

## B6 — ComfyUI has no cancel and no private-network guard (security, self-hosted only)

**Evidence.** `lib/studio/providers.ts`: submit `/prompt`, poll `/history/<id>`, fetch `/view`, timeouts
present; no `/interrupt`; `comfyEndpoint()` checks only `^https?://`.

**What it means.** A runaway job cannot be stopped, and a hostile or mistyped endpoint can point the adapter at
internal addresses (`169.254.169.254`, RFC1918). Exposure today is nil because no endpoint is configured.

**Minimum action.** Validate the resolved host against a private/link-local denylist with an explicit
owner-authorised override, and implement cancel via `/interrupt` plus `/queue` deletion.

**Closes when.** A test proves private hosts are refused and cancel is called.

---

## B7 — The agent worker has no model call (capability, not security)

**Evidence.** No `generateText`, `streamText`, OpenAI/Anthropic/Groq SDK call anywhere in `lib/agents` or
`lib/actions`; `agent-config.ts` only checks that a credential exists. The chat loop in
`app/(chat)/api/chat/route.ts` does call a real model.

**What it means.** "AI agent" in this product currently means deterministic tools orchestrated by rules. Chat
is AI; the worker is not. Any marketing that says otherwise is exactly the hallucination the owner forbids.

**Minimum action.** Either wire a model into the worker's planning step behind the same kill switch and cost
cap, or describe the worker as deterministic in every surface.

---

## B8 — Production database state is unaudited (visibility)

**Evidence.** Port 5432 unreachable from the sandbox; no production credential held.

**What it means.** I cannot state production row counts, migration journal state, or RLS enforcement. Any such
number in an earlier report came from another source and is not re-verified here.

**Minimum action.** An owner-run read-only check through the existing admin path, or acceptance that this stays
unknown.

---

## Recommended order

1. **B3** (engineering, no money, no deploy): make approval a real consumable record. It is the only blocker
   that gets worse the moment a credential exists.
2. **B6** (engineering, no money): close the SSRF and cancel gaps before any self-hosted GPU exists.
3. **B2** (owner, one secret entry): unblocks proof of the whole paid line at a cost of about $0.06.
4. **B4** (reviewed migration batch on non-production first).
5. **B5** (one recorded live run).
6. **B1** (protected merge + deploy, the only step that reaches a customer).
7. **B7**, **B8** (capability and visibility debt, neither blocks release).

B3 and B6 are safe development that this directive permits. B2, B4 and B1 each need the owner, and each is a
single decision.
