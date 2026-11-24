CREATE TABLE IF NOT EXISTS "AgentTemplateLink" (
  "agentId" uuid PRIMARY KEY NOT NULL REFERENCES "AgentIdentity" ("id") ON DELETE CASCADE,
  "organizationId" varchar(64) NOT NULL,
  "tokenHash" varchar(64) NOT NULL UNIQUE,
  "payload" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "revokedAt" timestamptz
);

CREATE INDEX IF NOT EXISTS "AgentTemplateLink_organizationId_idx"
  ON "AgentTemplateLink" ("organizationId");

ALTER TABLE "AgentTemplateLink" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgentTemplateLink";
CREATE POLICY tenant_isolation ON "AgentTemplateLink" FOR ALL
  USING ("organizationId" = current_setting('app.organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentTemplateLink" TO zooka_runtime;
  ELSE
    RAISE NOTICE 'zooka_runtime role absent: AgentTemplateLink grant skipped';
  END IF;
END $$;
