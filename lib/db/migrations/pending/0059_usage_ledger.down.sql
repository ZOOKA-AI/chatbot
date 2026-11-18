-- Rollback for 0059. Drops only what the migration created.
DROP POLICY IF EXISTS usage_ledger_tenant ON "UsageLedger";
DROP TABLE IF EXISTS "UsageLedger";
