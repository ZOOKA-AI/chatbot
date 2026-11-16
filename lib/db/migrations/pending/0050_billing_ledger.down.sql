-- Rollback for 0050. Refuses to drop a ledger that carries money.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "CreditLedger" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "PaymentTransaction" LIMIT 1) THEN
    RAISE EXCEPTION 'refusing to drop billing tables: ledger or payment rows exist';
  END IF;
END $$;

DROP TABLE IF EXISTS "PaymentTransaction";
DROP TABLE IF EXISTS "UsageCounter";
DROP TABLE IF EXISTS "CreditLedger";
DROP TABLE IF EXISTS "CreditReservation";
DROP TABLE IF EXISTS "BillingAccount";
