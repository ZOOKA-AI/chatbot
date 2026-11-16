# Release readiness — ZOOKA-AI MVP

Prepared 16 November 2026. Everything below is measured on the draft branches; nothing has been
applied to production, deployed to production, or merged.

## 1. What is ready

| Area | State | Evidence |
|---|---|---|
| Customer document artifact | Working end to end | `acceptance` 31/31, screenshots + trace under `acceptance/` |
| Tenant isolation | Enforced in queries, RLS, and now the schema | RLS counts per organization, composite foreign key, 731 tests |
| Worker write path | Allowlisted and gated | `INTERNAL_WRITE_TOOLS`, approval and tool-permission tests |
| Migrations | Additive, reversible, self-verifying | 0042 up → verify → down → reapply on a scratch database |
| Quality gates | Green twice | 731 passed / 6 skipped / 737 in 91 files, `tsc` 0 errors, build compiled |

## 2. Release candidate

The candidate is the head of the draft PR **#95** (`feat/commander-tenant-scope`) recorded in the
engineering ledger. It is not a release commit yet: a release commit is cut only after the owner
approves deployment, because the next step changes production.

## 3. Migration inventory (pending, not applied to production)

| Order | Migration | Nature | Rollback |
|---|---|---|---|
| 1 | `0027_agent_command_center.sql` | creates the Commander tables | drop tables |
| 2 | `pending/0028_agent_tenant_scope.sql` | adds `organizationId` + indexes | drop columns |
| 3 | `pending/0033_decision_audit_uniqueness.sql` | unique decision per approval | drop index |
| 4 | `pending/0034_agent_execution.sql` | execution rows | drop table |
| 5 | `pending/0035_worker_lease_and_scheduler.sql` | lease, idempotency, schedule slots | drop columns |
| 6 | `pending/0036_chat_deleted_at.sql`, `0037_user_email_verified_naming` | production drift repairs | rename back |
| 7 | `pending/0038_schedule_and_agent_model.sql` | cron/model columns | drop columns |
| 8 | `pending/0039_launch_plan.sql` | launch plans | drop table |
| 9 | `pending/0040_agent_tools_and_instructions.sql` | `allowedTools`, `instructions` (nullable) | drop columns |
| 10 | `pending/0041_workspace_projects.sql` | `AgentProject` + `projectId` (nullable), RLS | `.down.sql` |
| 11 | `pending/0042_project_documents.sql` | `ProjectDocument`, RLS, tenant-coupling constraint | `.down.sql` |

Every migration from 0040 on is additive and nullable, so the currently deployed application keeps
working against the new schema. That ordering matters: apply schema first, deploy code second.

Do **not** use `pnpm db:migrate`: the repository journal is inconsistent (duplicate numbers, deleted
entries) and does not reflect production. Use the ordered files, or the app's own
`/api/admin/migrate` route with a named key, which fails loudly instead of half-applying.

## 4. Deployment plan (requires owner approval)

1. Take a fresh backup (`/api/admin/backup`) and verify it restores into a scratch database.
2. Apply migrations 0036 → 0042 to a **copy** of production; verify with the parity and isolation
   checks, not by eye.
3. Apply the same set to production through the ordered route, confirming `failed = {}`.
4. Deploy the application, confirm the deployment is READY for the same commit.
5. Smoke test: sign-in, project list, one action run, document open, document download.
6. Keep the previous deployment available for rollback for 24 hours.

## 5. Rollback plan

- Application: redeploy the previous READY deployment; no schema change is required to go back
  because every new column is nullable and every new table is additive.
- Database, 0042 only: run `0042_project_documents.down.sql`. It drops the document table and the
  unique key it added to `AgentProject`. Documents are lost by design: they live in that table.
- Database, 0028 → 0041: each has a documented inverse. Dropping `organizationId` returns the
  Commander to single-tenant behaviour, which is why it is the last resort, not the first.

## 6. Security report

**Verified in this cycle**

- The worker refused a write tool by default and still does. A tool runs only when it declares
  `internalWrite` *and* is listed in `INTERNAL_WRITE_TOOLS`; a tool claiming the flag without being
  listed is refused, and the registry invariant is asserted by a test.
- The allowlist does not grant permission. An agent whose `allowedTools` excludes the write tool is
  refused, and one grant never implies another.
- The allowlist does not bypass approval. An approval-gated write task cannot be claimed before the
  decision, becomes claimable after approval, and stays unclaimable after rejection.
- A document from another workspace answers 404 for read, list and download. The id is not
  distinguishable from one that does not exist.
- Without a session the document API answers 307 to `/login` and the viewer renders nothing.
  *Correction of an earlier reading*: the first version of this check followed the redirect and
  reported 200, which looked like a breach and was a defect in the test. Requests now assert on the
  refusal itself, with redirects disabled.
- Tenant coupling is now enforced by the database. Before this change a row could name workspace A
  while pointing at workspace B's project and still pass every `organizationId` filter; the
  composite foreign key `(projectId, organizationId)` makes that insert fail.

**Open, and not hidden**

- Agent keys are bearer credentials with no expiry and no rotation schedule.
- Workspace API routes have no rate limit; the login rate limiter is per-process, so its real
  ceiling is a multiple of the instance count.
- 39 Dependabot alerts remain open on the default branch (16 high, 16 moderate, 7 low).
- External actions that need a credential the platform does not have still end in an honest 401.

## 7. Known limitations at this candidate

1. **No AI model adapter.** `modelProvider` and `modelId` are stored and shown, but nothing executes
   the chosen model; actions are deterministic tools. The UI says so.
2. **No natural-language routing.** Customers choose from the catalog; they cannot yet ask in
   Arabic prose and have it routed.
3. **No browser runtime.** Browser isolation, watch/pause/take-control and the command center are
   not built; nothing simulates them.
4. **Onboarding is manual.** A workspace, project and agent are created through the API and console.
5. **Two-tenant verification is local only.** Cross-workspace refusal is proven with two real
   accounts on the acceptance database, not on production.

## 8. Acceptance evidence

`acceptance/execution-project.png` (executed task and evidence on the project page),
`acceptance/execution-document.png` (the document as the customer reads it),
`acceptance/execution-document-foreign.png` (the second workspace, which cannot see it),
`acceptance/execution-trace.zip` (Playwright trace of the whole journey).

The run: sign-in by form → agent holding one tool → project → action → worker claims and executes →
document of 1,017 characters stored → project page lists it → viewer opens it → download returns
`text/markdown` of the exact stored length → reload still shows it → sign-out refuses it → sign-in
restores it → second workspace gets 404 on read, list and download.

## Studio additions (Directive #052)

| Migration | Status |
|---|---|
| 0044_studio_media | verified up/down on a local database; applied to development (zooka_ui, zooka_ws) only |

New runtime dependencies, all on the server and all free: `ffmpeg`/`ffprobe` on the host, `rembg` +
`onnxruntime` + `pillow` (Python, for cutouts), `piper-tts` (Python, for Arabic narration) plus one voice
model file.

Release blockers unchanged in kind, plus two new machine requirements: a host with a writable volume
(`STUDIO_MEDIA_DIR`) and enough RAM for a segmentation model. Serverless functions are unsuitable for
both rendering and cutouts.

Generation remains blocked: no `COMFYUI_ENDPOINT`. Setup is documented in `COMFYUI_SETUP.md`; nothing in
the deterministic path depends on it.
