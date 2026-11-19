-- Launch testing program: the first 20 genuinely registered accounts get free
-- access until the owner ends the program.
--
-- The claim is a table, not a counter, so allocation is atomic by construction:
-- a unique primary key on the slot and a unique claim per user make duplicate
-- grants and race conditions impossible without any application-level lock.
-- One row per granted slot, at most twenty rows ever.

CREATE TABLE IF NOT EXISTS "LaunchTestingClaim" (
  "slot" integer PRIMARY KEY CHECK ("slot" BETWEEN 1 AND 20),
  "userId" uuid NOT NULL UNIQUE,
  "claimedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "LaunchTestingClaim_claimedAt_idx"
  ON "LaunchTestingClaim" ("claimedAt");

-- Bootstrap-only: a claim is decided during registration, before any tenant
-- context exists, so the runtime role gets no access at all (same treatment as
-- GuestUsage and the token tables in 0052).
ALTER TABLE "LaunchTestingClaim" ENABLE ROW LEVEL SECURITY;
