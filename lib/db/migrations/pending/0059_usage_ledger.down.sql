-- Rollback for 0059. Drops only what the migration created, and refuses to discard money records.
--
-- "UsageLedger" holds what each workspace was charged. Dropping it is not a schema change, it is
-- erasing the evidence used to reconcile provider invoices, so the rollback stops while any row
-- exists rather than returning success over data loss.

BEGIN;

DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public."UsageLedger"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "UsageLedger"' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'forward_only: "UsageLedger" holds % row(s); rollback refused to discard them', n;
    END IF;
  END IF;
END $$;

DROP POLICY IF EXISTS usage_ledger_tenant ON "UsageLedger";
DROP TABLE IF EXISTS "UsageLedger";

COMMIT;
