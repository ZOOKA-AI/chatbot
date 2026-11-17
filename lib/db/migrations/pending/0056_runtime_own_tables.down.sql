-- Rollback for 0056.
--
-- These objects are created by this migration, so dropping them is the exact
-- inverse. Guarded: refuse while any of them still holds rows, so a rollback
-- can never silently discard a workspace's memory, publishing queue or keys.

BEGIN;

DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY array[
    'agent_memory','creative_credits','creative_usage','mcp_api_key',
    'publish_post','token_wallets','token_grants','PhoneOtp'
  ] LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'refusing to drop % : % rows present', t, n;
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS token_grants;
DROP TABLE IF EXISTS token_wallets;
DROP TABLE IF EXISTS publish_post;
DROP TABLE IF EXISTS mcp_api_key;
DROP TABLE IF EXISTS creative_usage;
DROP TABLE IF EXISTS creative_credits;
DROP TABLE IF EXISTS agent_memory;
DROP TABLE IF EXISTS "PhoneOtp";

COMMIT;
