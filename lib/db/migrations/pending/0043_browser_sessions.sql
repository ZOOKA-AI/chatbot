-- Real browser sessions, tenant-scoped.
--
-- A session is a row before it is a browser: the row is what authorizes the browser, what gives it
-- an owner and a workspace, and what proves afterwards that it existed. Nothing is launched until a
-- session row exists, and every control action re-reads that row through the caller's organization.

CREATE TABLE IF NOT EXISTS "BrowserSession" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" varchar(64) NOT NULL,
  "projectId" uuid,
  "taskId" uuid,
  "ownerId" varchar(64) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'created',
  "startUrl" text,
  "currentUrl" text,
  "currentTitle" text,
  "controlHolder" varchar(16) NOT NULL DEFAULT 'agent',
  "lastError" text,
  "stepCount" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "startedAt" timestamp with time zone,
  "lastSeenAt" timestamp with time zone,
  "expiresAt" timestamp with time zone NOT NULL DEFAULT (now() + interval '30 minutes'),
  "endedAt" timestamp with time zone,
  CONSTRAINT "BrowserSession_status_check" CHECK (
    "status" IN ('created','starting','ready','running','paused','taken_over','stopping','stopped','expired','failed')
  ),
  CONSTRAINT "BrowserSession_control_check" CHECK ("controlHolder" IN ('agent','human'))
);

-- The browser is only ever opened for a project that belongs to the same workspace, and the same
-- composite key that couples documents to their project does the work here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrowserSession_project_tenant_fkey') THEN
    ALTER TABLE "BrowserSession"
      ADD CONSTRAINT "BrowserSession_project_tenant_fkey"
      FOREIGN KEY ("projectId", "organizationId")
      REFERENCES "AgentProject" ("id", "organizationId")
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrowserSession_taskId_fkey') THEN
    ALTER TABLE "BrowserSession"
      ADD CONSTRAINT "BrowserSession_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "AgentTask" ("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "BrowserSession_org_status_idx"
  ON "BrowserSession" ("organizationId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "BrowserEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" varchar(64) NOT NULL,
  "sessionId" uuid NOT NULL REFERENCES "BrowserSession" ("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "kind" varchar(32) NOT NULL,
  "actor" varchar(16) NOT NULL DEFAULT 'agent',
  "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "BrowserEvent_actor_check" CHECK ("actor" IN ('agent','human','system'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrowserEvent_session_seq_key" ON "BrowserEvent" ("sessionId", "seq");
CREATE INDEX IF NOT EXISTS "BrowserEvent_org_created_idx" ON "BrowserEvent" ("organizationId", "createdAt");

CREATE TABLE IF NOT EXISTS "BrowserEvidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" varchar(64) NOT NULL,
  "sessionId" uuid NOT NULL REFERENCES "BrowserSession" ("id") ON DELETE CASCADE,
  "label" varchar(120) NOT NULL,
  "url" text,
  "title" text,
  "path" text NOT NULL,
  "bytes" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "BrowserEvidence_session_created_idx"
  ON "BrowserEvidence" ("sessionId", "createdAt");

-- Approval requests raised by the browser, so a consequential step waits for a person. The task
-- approval engine already exists; this links a browser session to the decision that let it proceed.
ALTER TABLE "BrowserSession" ADD COLUMN IF NOT EXISTS "pendingApprovalId" uuid;

ALTER TABLE "BrowserSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrowserEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrowserEvidence" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "BrowserSession_tenant_isolation" ON "BrowserSession";
CREATE POLICY "BrowserSession_tenant_isolation" ON "BrowserSession"
  FOR ALL USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS "BrowserEvent_tenant_isolation" ON "BrowserEvent";
CREATE POLICY "BrowserEvent_tenant_isolation" ON "BrowserEvent"
  FOR ALL USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS "BrowserEvidence_tenant_isolation" ON "BrowserEvidence";
CREATE POLICY "BrowserEvidence_tenant_isolation" ON "BrowserEvidence"
  FOR ALL USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'BrowserSession') THEN
    RAISE EXCEPTION 'BrowserSession was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'BrowserSession_tenant_isolation') THEN
    RAISE EXCEPTION 'BrowserSession has no tenant policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrowserSession_project_tenant_fkey') THEN
    RAISE EXCEPTION 'BrowserSession is not tenant-coupled to its project';
  END IF;
END $$;
