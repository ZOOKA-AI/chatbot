-- Shared counters for authentication throttling (lib/auth/throttle-store.ts).
--
-- NOT APPLIED ANYWHERE. It lives outside the migration journal on purpose: the
-- journal tracks migrations that have an approved number, and applying anything
-- to production is an owner decision. Until this table exists and
-- AUTH_THROTTLE_STORE=postgres is set, the application counts per instance.
--
-- The table holds no email and no address: "key" is an HMAC of them.
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS "AuthThrottle" (
  "key" varchar(80) PRIMARY KEY,
  "count" integer NOT NULL DEFAULT 0,
  "resetAt" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuthThrottle_resetAt_idx" ON "AuthThrottle" ("resetAt");
--> statement-breakpoint
ALTER TABLE "AuthThrottle" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "AuthThrottle" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "AuthThrottle" FROM authenticated;
  END IF;
END $$;

-- Rollback: DROP TABLE IF EXISTS "AuthThrottle";
