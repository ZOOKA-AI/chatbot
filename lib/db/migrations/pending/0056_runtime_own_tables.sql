-- 0056_runtime_own_tables
--
-- Six feature modules used to create their own tables at request time
-- (agent_memory, creative_credits/creative_usage, mcp_api_key, publish_post,
-- token_wallets/token_grants, "PhoneOtp"). That worked only while the
-- application connected as the database owner. Under the least-privilege
-- runtime role the first CREATE is denied (SQLSTATE 42501, "permission denied
-- for schema public"), and because it runs inside the request transaction the
-- whole transaction aborts: a chat message was lost because saving agent memory
-- tried to create a table.
--
-- The schema belongs to migrations, not to request handlers. This migration
-- creates the six objects with the exact shapes the modules already use, puts
-- them under Row Level Security with an organisation policy, and grants the
-- runtime role only what it needs. The modules no longer issue DDL.
--
-- "PhoneOtp" is a pre-authentication table holding one-time codes: like the
-- token tables in 0052 it gets RLS enabled, no policy and no runtime grant, so
-- only the bootstrap connection can touch it.
--
-- Idempotent: every statement is IF NOT EXISTS / IF EXISTS.

BEGIN;

-- 1. Tables, exactly as the modules declared them.

CREATE TABLE IF NOT EXISTS agent_memory (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  organization_id text NOT NULL,
  memory_key text NOT NULL,
  memory_value text NOT NULL,
  importance integer NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id, memory_key)
);

CREATE INDEX IF NOT EXISTS agent_memory_org_idx
  ON agent_memory (organization_id, importance DESC);

CREATE TABLE IF NOT EXISTS creative_credits (
  organization_id text PRIMARY KEY,
  image_units integer NOT NULL DEFAULT 0,
  video_units integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creative_usage (
  id bigserial PRIMARY KEY,
  organization_id text NOT NULL,
  kind varchar(16) NOT NULL,
  source varchar(16) NOT NULL,
  weighted_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_api_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  created_by_user_id text,
  name varchar(80) NOT NULL,
  key_prefix varchar(20) NOT NULL,
  key_hash varchar(64) NOT NULL UNIQUE,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_api_key_org_idx
  ON mcp_api_key (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS publish_post (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  external_id text,
  channel varchar(24) NOT NULL,
  caption text NOT NULL,
  media_url text,
  status varchar(16) NOT NULL DEFAULT 'queued',
  provider_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS publish_post_external_idx
  ON publish_post (organization_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS publish_post_org_idx
  ON publish_post (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS token_wallets (
  organization_id text PRIMARY KEY,
  plan text NOT NULL,
  weighted_remaining bigint NOT NULL DEFAULT 0,
  period_start timestamptz,
  period_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS token_grants (
  id bigserial PRIMARY KEY,
  organization_id text NOT NULL,
  grant_key text NOT NULL UNIQUE,
  plan text NOT NULL,
  weighted bigint NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS token_grants_org_idx ON token_grants (organization_id);

CREATE TABLE IF NOT EXISTS "PhoneOtp" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(32) NOT NULL,
  code_hash varchar(64) NOT NULL,
  ip varchar(64),
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "PhoneOtp_phone_created_idx"
  ON "PhoneOtp" (phone, created_at DESC);

-- 2. Row Level Security. Every organisation-owned table gets the same policy
--    shape: a row is visible and writable only inside its own organisation.
--    current_setting(..., true) returns NULL outside a tenant transaction, and
--    NULL never equals anything, so an unscoped connection sees nothing.

ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE publish_post ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhoneOtp" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON agent_memory;
CREATE POLICY tenant_isolation ON agent_memory FOR ALL
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON creative_credits;
CREATE POLICY tenant_isolation ON creative_credits FOR ALL
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON creative_usage;
CREATE POLICY tenant_isolation ON creative_usage FOR ALL
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON mcp_api_key;
CREATE POLICY tenant_isolation ON mcp_api_key FOR ALL
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON publish_post;
CREATE POLICY tenant_isolation ON publish_post FOR ALL
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON token_wallets;
CREATE POLICY tenant_isolation ON token_wallets FOR ALL
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON token_grants;
CREATE POLICY tenant_isolation ON token_grants FOR ALL
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

-- 3. Grants. Wrapped so a database without the runtime role (local test runs,
--    a fresh clone) still applies the migration instead of failing on a role
--    that was never created here.

DO $$
BEGIN
  IF to_regrole('zooka_runtime') IS NULL THEN
    RAISE NOTICE 'skip grants: zooka_runtime absent';
    RETURN;
  END IF;

  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    agent_memory, creative_credits, creative_usage, mcp_api_key,
    publish_post, token_wallets, token_grants
    TO zooka_runtime;

  GRANT USAGE, SELECT ON SEQUENCE
    agent_memory_id_seq, creative_usage_id_seq, token_grants_id_seq
    TO zooka_runtime;
END $$;

COMMIT;
