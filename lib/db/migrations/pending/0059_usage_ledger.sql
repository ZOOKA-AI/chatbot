-- 0059_usage_ledger (ADDITIVE)
--
-- Why: cost today is invisible. A model call is billed by the provider whether or not the request
-- finished, so without a record per request there is no way to answer "what did this workspace spend
-- yesterday" or to refuse the next call when the budget is gone.
--
-- This is an append-only accounting book, not a statistics table: a reservation, a settlement and a
-- correction are three rows, never an UPDATE of history. That is what makes it auditable.
--
-- Deliberately NOT stored: prompt text, raw cache keys, provider credentials, request payloads.
-- Only a prompt identifier, its version and a hash of its content; a hash of a cache key, not the key.
--
-- Risk: additive only. New table, new indexes, RLS enabled with one tenant policy. No existing table is
-- touched, no row is rewritten, no privilege is granted to any runtime role beyond the table itself.
-- Rollback: pending/0059_usage_ledger.down.sql (drops the table; nothing else depends on it).

CREATE TABLE IF NOT EXISTS "UsageLedger" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" varchar(64) NOT NULL,
  "userId" varchar(64),
  "taskId" uuid,
  "stepId" uuid,

  -- 'reserve' holds money before a call, 'settle' records what it actually cost, 'adjust' corrects a
  -- provider-side difference. Summing only 'settle' and 'adjust' gives the true spend.
  kind varchar(16) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending',

  provider varchar(64) NOT NULL,
  model varchar(128) NOT NULL,

  "promptId" varchar(128),
  "promptVersion" varchar(32),
  "promptHash" varchar(64),

  "inputTokens" bigint NOT NULL DEFAULT 0,
  "outputTokens" bigint NOT NULL DEFAULT 0,

  cached boolean NOT NULL DEFAULT false,
  "cacheKeyHash" varchar(64),

  "costUsd" numeric(18, 9) NOT NULL DEFAULT 0,
  "latencyMs" integer,

  "requestId" varchar(128) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "UsageLedger_cost_nonnegative" CHECK ("costUsd" >= 0),
  CONSTRAINT "UsageLedger_tokens_nonnegative" CHECK ("inputTokens" >= 0 AND "outputTokens" >= 0),
  CONSTRAINT "UsageLedger_kind_known" CHECK (kind IN ('reserve', 'settle', 'adjust')),
  -- One settlement per request per workspace: a retried webhook cannot bill the same call twice.
  CONSTRAINT "UsageLedger_request_unique" UNIQUE ("organizationId", "requestId", kind)
);

CREATE INDEX IF NOT EXISTS "UsageLedger_org_time_idx"
  ON "UsageLedger" ("organizationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "UsageLedger_task_idx"
  ON "UsageLedger" ("taskId") WHERE "taskId" IS NOT NULL;

ALTER TABLE "UsageLedger" ENABLE ROW LEVEL SECURITY;

-- Same shape as the rest of the tenant tables: a row is visible only inside its workspace context.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'UsageLedger' AND policyname = 'usage_ledger_tenant') THEN
    CREATE POLICY usage_ledger_tenant ON "UsageLedger"
      USING ("organizationId" = current_setting('app.organization_id', true))
      WITH CHECK ("organizationId" = current_setting('app.organization_id', true));
  END IF;
END $$;
