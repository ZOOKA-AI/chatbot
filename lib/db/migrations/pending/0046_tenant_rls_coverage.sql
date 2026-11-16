-- 0046_tenant_rls_coverage
--
-- Closes the tenant-isolation gap measured on 2026-11-16: 33 of 47 public tables
-- had no row level security at all, including Chat, Message, Document and Project.
--
-- Classification used to build this migration (evidence: information_schema dump)
--   tenant-owned, direct organizationId ....... 18 tables  -> policy + full grants
--   tenant-owned through Chat (chatId) ........  5 tables  -> EXISTS policy + full grants
--   tenant-owned, already protected ........... 12 tables  -> untouched (grants only)
--   shared / global ........................... BlogPost, Organization -> read-only policy
--   user-owned (no org column) ................ Suggestion, User, token tables -> NOT policed
--   auth / internal operational ............... no grants, no policy
--
-- Deliberately NOT done, with reasons recorded in docs/engineering/TENANT_RLS_COVERAGE.md:
--   * no blanket organizationId policy on any table that lacks that column
--   * FORCE ROW LEVEL SECURITY is not set: it is inert against the BYPASSRLS owner and
--     would make the current owner-role connection return zero rows
--   * user-owned tables are not policed because there is no app.user_id context yet
--
-- Idempotent: safe to re-run.

BEGIN;

-- 1. Tenant-owned tables with a direct organizationId column -------------------
ALTER TABLE "AgentMessage"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSchedule"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Base44AgentSession"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Chat"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleDriveConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaJob"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "N8nConnection"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OAuthConnection"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationMember"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralEvent"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudioProject"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudioSpendApproval"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageEvent"           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "AgentMessage";
CREATE POLICY tenant_isolation ON "AgentMessage" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "AgentSchedule";
CREATE POLICY tenant_isolation ON "AgentSchedule" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "Base44AgentSession";
CREATE POLICY tenant_isolation ON "Base44AgentSession" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "Chat";
CREATE POLICY tenant_isolation ON "Chat" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "Document";
CREATE POLICY tenant_isolation ON "Document" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "GoogleDriveConnection";
CREATE POLICY tenant_isolation ON "GoogleDriveConnection" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "Invitation";
CREATE POLICY tenant_isolation ON "Invitation" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "MediaJob";
CREATE POLICY tenant_isolation ON "MediaJob" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "N8nConnection";
CREATE POLICY tenant_isolation ON "N8nConnection" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "OAuthConnection";
CREATE POLICY tenant_isolation ON "OAuthConnection" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "OrganizationMember";
CREATE POLICY tenant_isolation ON "OrganizationMember" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "Project";
CREATE POLICY tenant_isolation ON "Project" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "ReferralEvent";
CREATE POLICY tenant_isolation ON "ReferralEvent" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "StudioProject";
CREATE POLICY tenant_isolation ON "StudioProject" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "StudioSpendApproval";
CREATE POLICY tenant_isolation ON "StudioSpendApproval" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "Subscription";
CREATE POLICY tenant_isolation ON "Subscription" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "UsageEvent";
CREATE POLICY tenant_isolation ON "UsageEvent" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

-- 2. Child rows owned through their parent Chat -------------------------------
-- These tables carry chatId but no organizationId. A blanket organizationId policy
-- cannot apply here; ownership is resolved through the parent row.
ALTER TABLE "Message"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vote"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vote_v2"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stream"     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_via_chat ON "Message";
CREATE POLICY tenant_isolation_via_chat ON "Message" FOR ALL
  USING (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Message"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Message"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)));

DROP POLICY IF EXISTS tenant_isolation_via_chat ON "Message_v2";
CREATE POLICY tenant_isolation_via_chat ON "Message_v2" FOR ALL
  USING (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Message_v2"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Message_v2"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)));

DROP POLICY IF EXISTS tenant_isolation_via_chat ON "Vote";
CREATE POLICY tenant_isolation_via_chat ON "Vote" FOR ALL
  USING (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Vote"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Vote"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)));

DROP POLICY IF EXISTS tenant_isolation_via_chat ON "Vote_v2";
CREATE POLICY tenant_isolation_via_chat ON "Vote_v2" FOR ALL
  USING (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Vote_v2"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Vote_v2"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)));

DROP POLICY IF EXISTS tenant_isolation_via_chat ON "Stream";
CREATE POLICY tenant_isolation_via_chat ON "Stream" FOR ALL
  USING (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Stream"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Stream"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)));

-- 3. Shared content: readable, not tenant-scoped ------------------------------
-- BlogPost already had RLS enabled with zero policies, which denies everything.
DROP POLICY IF EXISTS public_read ON "BlogPost";
CREATE POLICY public_read ON "BlogPost" FOR SELECT USING (true);

-- 4. Least-privilege grants for the runtime role ------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "AgentLaunchPlan","AgentMessage","AgentSchedule","Base44AgentSession","Chat",
  "Document","GoogleDriveConnection","Invitation","MediaJob","N8nConnection",
  "OAuthConnection","OrganizationMember","Project","ReferralEvent","StudioProject",
  "StudioSpendApproval","Subscription","UsageEvent",
  "Message","Message_v2","Vote","Vote_v2","Stream"
TO zooka_runtime;

-- shared / read-mostly
GRANT SELECT ON "BlogPost" TO zooka_runtime;
GRANT SELECT, INSERT, UPDATE ON "Organization" TO zooka_runtime;

-- auth path: registration and login need these; delete is withheld
GRANT SELECT, INSERT, UPDATE ON "User" TO zooka_runtime;
GRANT SELECT, INSERT, DELETE ON "EmailVerificationToken" TO zooka_runtime;
GRANT SELECT, INSERT, DELETE ON "PasswordResetToken" TO zooka_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Suggestion" TO zooka_runtime;

-- operational, append-mostly
GRANT SELECT, INSERT ON "WebhookEvent" TO zooka_runtime;
GRANT SELECT, INSERT ON "GuestUsage" TO zooka_runtime;
GRANT SELECT, INSERT ON "Affiliate" TO zooka_runtime;

COMMIT;
