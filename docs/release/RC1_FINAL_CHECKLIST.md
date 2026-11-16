# RC-1 final release checklist

Prepared 16 November 2026, 21:20 Dubai. Everything below was measured in this session unless marked
as owner action. Nothing was deployed, migrated or merged to produce it.

## 1. Hosted Preview URL

**https://chatbot-git-release-rc-1-zooka-ai1.vercel.app**

Verified reachable just now: HTTP **302** to Vercel SSO, which is the expected answer for a client
without the owner's Vercel session. It serves the last commit that deployed successfully, `1be4fc3`.

Note: the newest commit `f5ab1d3` (this checklist's own docs commit) shows **failure** on Vercel with
the reason link `why-is-my-account-deployment-blocked`. That is the overdue account balance, not the
code: `1be4fc3` and `7365e9c` both report success on the identical application tree.

## 2. Six manual acceptance journeys

Run these in the owner's signed-in Chrome, in this order. Each has a pass condition, not a feeling.

| # | Journey | Steps | Pass condition |
| --- | --- | --- | --- |
| 1 | Registration | Open `/register`, create an account with a fresh address | Lands in the workspace, no 500, no loop back to `/login` |
| 2 | Login | `/login` with the same credentials | Session established, workspace loads |
| 3 | Session persistence | Reload, open a second tab, wait 5 minutes, reload again | Still signed in, no redirect to `/login` |
| 4 | Chat | Send a message, reload the page | Message appears, survives reload, stored per workspace |
| 5 | Agent execution | From chat, ask the agent to run one authorized tool, e.g. create a project document | Task moves queued → running → completed, result visible, nothing cross-tenant |
| 6 | Logout | Sign out, then load `/workspace` directly | Redirected to `/login`; the session is gone after reload |

Record the screenshot or the HTTP status of each. Anything that fails: note the journey number and
the exact message; that becomes the defect list, not a retry.

## 3. Production backup

Pulled now: **HTTP 200, 873,467 bytes, sha256 8044c7ea…, generatedAt 2026-11-16T16:46:08Z.**
Content: 278 users, 278 organizations, 63 chats, 315 messages (`Message_v2`), 22 documents, 370 usage
events, 14 tables.

Restore rehearsal on this same backup: **passed** — every table has a destination, 0 foreign-key
orphans, 278 users with 278 valid bcrypt hashes and 0 nulls, `Document`'s 22 rows included.
Take one more backup immediately before the migration window; the file is private (contains hashes).

## 4. Migration order and prerequisites

**Order: `0017` → `0027` → `0028` … `0049`.**

- `0017_base44_agent_session.sql` and `0017_client_projects.sql` first: production has no `Project`
  table and no agent-core tables, and `0028` opens by altering `AgentIdentity`, so without them the
  ladder fails on its first statement.
- `0027_agent_command_center.sql` next: the task/approval tables that `0028` and `0033` assume.
- Then the 22 pending migrations in filename order, `0028` → `0049`.

Verified on a database rebuilt from a schema-only dump of production: **24/24 apply, 27/27 checks**,
40 → 58 tables, 62 foreign keys, 65 policies, `zooka_runtime` created with `NOBYPASSRLS` and 173
grants, runtime role sees `own=1 foreign=0`, every rollback applies or refuses on populated data.

Prerequisites that must hold: `zooka_runtime` password set outside the migration files; `DATABASE_URL_SERVICE`
defined before tenant isolation is switched on; migration `0050` (billing) **excluded** — it lives on
`feat/uae-billing` only.

## 5. Exact deployment sequence

1. Owner approves the window.
2. Fresh backup, stored privately, restore rehearsal repeated if the row counts moved.
3. Apply the ladder from a host with direct database access (the sandbox cannot reach `5432`):
   `scripts/selfhost/migrate.ts` against production, which sorts base migrations then `pending/` and
   skips `.down.sql`. This runner was proven on Neon: 46 applied, 0 failed, exit 0.
4. Verify before touching code: table count 40 → 58, `zooka_runtime` exists with `NOBYPASSRLS`,
   173 table grants, 65 policies, and the business row counts unchanged (278 users, 63 chats,
   315 messages, 22 documents).
5. Merge PR #98 (squash). Production `main` moves from `19473c0`.
6. Let Vercel build from `main`; confirm **READY** for the merged commit, not just "queued".
7. Post-deploy smoke: `/login` 200, `/api/auth/providers` 200, register + login, save a chat, run one
   agent tool, logout, and `POST /api/admin/migrate` returns **200 with `failed={}`** (idempotent).
8. Keep the backup and the `.down.sql` files at hand for 24 hours. Rollback is per migration, in
   reverse order; the five destructive ones are guarded and refuse while their tables hold rows.

## 6. Remaining risks

| Risk | Severity | Note |
| --- | --- | --- |
| Vercel account overdue, deployments now **blocked** | high | `f5ab1d3` failed with the account-blocked reason. Merging before settling produces a main branch that cannot deploy |
| Hosted journeys unverified | high | no bypass exists; the six journeys above are the only route |
| Production DB is reachable only from a host with `5432` | medium | the ladder must be run there; I cannot execute it from the sandbox |
| Ladder's first run on real production types | medium | 26 uuid/text comparisons were fixed after they failed locally; the Neon copy hid the defect because its columns are text |
| Five rollbacks drop tables | medium | 0029, 0034, 0035, 0038, 0039; guarded, but a rollback must never run after data exists without reading the guard |
| `0029` unique email index | low | 0 duplicate groups measured across 278 accounts today |
| Billing merged by accident | low | `0050` and all `lib/billing/{ledger,guard,payments}` are absent from `rc-1`; keep the squash scoped |
| PR #98 is Draft; branch protection requires the Vercel check | low | blocked by the same overdue balance |

## Approval requested

Two decisions, in this order:

1. **Settle the Vercel balance** so a merge can actually deploy (nothing else can fix this one).
2. **Approve the migration window** for `0017` → `0027` → `0028..0049`, and say whether you want the
   six journeys done by hand first or the merge taken immediately after the ladder verifies.

Billing stays on its own branch, PR #98 stays unmerged, and production stays at `19473c0` until you
answer.
