-- Studio media: the customer's own pictures, videos and audio, and the derivatives the editor
-- produces from them. Every row belongs to one workspace, and to one project when it came from one.
CREATE TABLE IF NOT EXISTS "StudioAsset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" varchar(64) NOT NULL,
  "projectId" uuid,
  "kind" varchar(8) NOT NULL,
  "source" varchar(16) NOT NULL,
  "storagePath" text NOT NULL,
  "mimeType" varchar(64) NOT NULL,
  "bytes" integer NOT NULL,
  "width" integer,
  "height" integer,
  "durationSeconds" numeric(8, 3),
  "status" varchar(16) NOT NULL DEFAULT 'ready',
  "operation" jsonb,
  "parentAssetId" uuid,
  "label" varchar(200),
  "createdBy" varchar(64),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "StudioAsset_kind_allowed" CHECK ("kind" IN ('image', 'video', 'audio')),
  CONSTRAINT "StudioAsset_source_allowed" CHECK ("source" IN ('upload', 'derived')),
  CONSTRAINT "StudioAsset_status_allowed" CHECK ("status" IN ('processing', 'ready', 'failed'))
);
DO $$ BEGIN
  ALTER TABLE "StudioAsset"
    ADD CONSTRAINT "StudioAsset_project_tenant_fkey"
    FOREIGN KEY ("projectId", "organizationId") REFERENCES "AgentProject"("id", "organizationId") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StudioAsset"
    ADD CONSTRAINT "StudioAsset_parent_fkey"
    FOREIGN KEY ("parentAssetId") REFERENCES "StudioAsset"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "StudioAsset_org_created_idx" ON "StudioAsset" ("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "StudioAsset_project_idx" ON "StudioAsset" ("projectId");
ALTER TABLE "StudioAsset" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "StudioAsset_tenant_read" ON "StudioAsset";
CREATE POLICY "StudioAsset_tenant_read" ON "StudioAsset" USING (
  "organizationId" = current_setting('app.organization_id', true)
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "StudioAsset" TO zooka_runtime;
  END IF;
END $$;
