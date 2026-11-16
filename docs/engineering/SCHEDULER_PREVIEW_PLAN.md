# Preview scheduling plan (not activated)

Nothing here is switched on. This is the plan a preview-only cron would follow,
written so the decision can be made deliberately rather than by accident.

## What the preview environment has today

Verified against the Vercel API on 16 Nov 2026, project `chatbot`:

| Variable | Preview | Consequence |
|---|---|---|
| `SCHEDULER_TOKEN` | absent | `/api/agents/scheduler` answers 401. An unconfigured token closes the endpoint; it never opens it. |
| `DATABASE_URL_PLATFORM` | absent | Even with a token, the endpoint answers 503 `platform_connection_required`. |
| `DATABASE_URL_TENANT` | absent | No tenant connection, so nothing can run as `zooka_runtime`. |
| `DATABASE_URL`, `POSTGRES_URL` | production only | Preview has no database credential at all. It cannot read or write production data, and it cannot run the queue either. |
| `AUTH_SECRET` | preview-only value | A production session cookie is not valid on preview, which is correct and is also why an authenticated preview session cannot be faked. |
| `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` | plain, both environments | Still pointing at the production project. Plain values, no secret, but the pointer should move once a development project exists. |

Seven variables are preview-targeted; none of them is a database credential. That
is the isolation mechanism in practice: the preview cannot touch tenant data
because it holds nothing to touch it with.

## The smallest safe preview cron

1. Create a preview-only database (Neon free or an existing development Postgres).
   Set `DATABASE_URL_TENANT` (role `zooka_runtime`), `DATABASE_URL_PLATFORM`
   (a selection-only role), and `TENANT_RLS_ENABLED=on`, preview scope only.
2. Apply migrations `0027` through `0035` to that database, in order. Order
   matters: `0031` revokes every table grant, so `0035` must come after it.
3. Generate `SCHEDULER_TOKEN` with 32 random bytes, preview scope only, and give
   the cron the same value as `CRON_SECRET`.
4. Set `SCHEDULER_PER_ORG_LIMIT=1`, `SCHEDULER_GLOBAL_LIMIT=1`,
   `SCHEDULER_BATCH_SIZE=1`, `SCHEDULER_TOOL=github_repo_inspect`.
5. Point one cron at `/api/agents/scheduler`, once an hour, preview only. Do not
   add a production cron in the same change.

## Cost and blast-radius controls

- One task per pass, one pass per hour, at most one tool call per task. A full day
  cannot exceed 24 GitHub reads.
- The platform connection refuses production hosts by code, so a misconfigured
  preview cannot select work from the real database.
- `SchedulerRun` records every pass, including the ones that do nothing, so an
  idle queue and a broken cron look different.
- Failure alerting: a `SchedulerRun` row with `status='failed'` or a pass that
  reclaims attempts repeatedly is the signal. Read it with SQL; no notification
  channel is wired yet, and this plan does not pretend otherwise.

## What is deliberately still missing

No cron is configured anywhere, preview or production. No alert is sent on
failure. Nothing enforces a monthly ceiling on scheduler passes; the per-pass
limits bound cost, not the month.
