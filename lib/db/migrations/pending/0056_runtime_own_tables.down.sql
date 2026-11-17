-- Rollback for 0056.
--
-- These eight objects are created by this migration, so dropping them is the
-- exact inverse. Each drop carries its own guard: the rollback refuses while
-- that table still holds rows, so it can never silently discard a workspace's
-- memory, publishing queue, API keys or token wallet.

BEGIN;

DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public."agent_memory"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "agent_memory"' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'forward_only: "agent_memory" holds % row(s); rollback refused to discard them', n;
    END IF;
  END IF;
END $$;

DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public."creative_credits"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "creative_credits"' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'forward_only: "creative_credits" holds % row(s); rollback refused to discard them', n;
    END IF;
  END IF;
END $$;

DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public."creative_usage"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "creative_usage"' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'forward_only: "creative_usage" holds % row(s); rollback refused to discard them', n;
    END IF;
  END IF;
END $$;

DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public."mcp_api_key"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "mcp_api_key"' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'forward_only: "mcp_api_key" holds % row(s); rollback refused to discard them', n;
    END IF;
  END IF;
END $$;

DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public."publish_post"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "publish_post"' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'forward_only: "publish_post" holds % row(s); rollback refused to discard them', n;
    END IF;
  END IF;
END $$;

DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public."token_wallets"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "token_wallets"' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'forward_only: "token_wallets" holds % row(s); rollback refused to discard them', n;
    END IF;
  END IF;
END $$;

DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public."token_grants"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "token_grants"' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'forward_only: "token_grants" holds % row(s); rollback refused to discard them', n;
    END IF;
  END IF;
END $$;

DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public."PhoneOtp"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "PhoneOtp"' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'forward_only: "PhoneOtp" holds % row(s); rollback refused to discard them', n;
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "agent_memory";
DROP TABLE IF EXISTS "creative_credits";
DROP TABLE IF EXISTS "creative_usage";
DROP TABLE IF EXISTS "mcp_api_key";
DROP TABLE IF EXISTS "publish_post";
DROP TABLE IF EXISTS "token_wallets";
DROP TABLE IF EXISTS "token_grants";
DROP TABLE IF EXISTS "PhoneOtp";

COMMIT;
