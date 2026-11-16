-- 0046_tenant_rls_coverage (down)
--
-- Restores the pre-0046 state exactly: the 23 tables this migration enabled RLS on
-- go back to RLS-off with no policy, BlogPost returns to "RLS on, zero policies",
-- and every grant added by this migration is revoked. Grants that existed before
-- 0046 (the twelve already-protected agent tables, and the browser tables granted
-- separately) are deliberately left alone.
--
-- This migration touches no data: enabling or disabling RLS and creating or dropping
-- policies never rewrites rows. Idempotent.

BEGIN;

-- 1. Policies created by 0046
DROP POLICY IF EXISTS tenant_isolation ON "AgentMessage";
DROP POLICY IF EXISTS tenant_isolation ON "AgentSchedule";
DROP POLICY IF EXISTS tenant_isolation ON "Base44AgentSession";
DROP POLICY IF EXISTS tenant_isolation ON "Chat";
DROP POLICY IF EXISTS tenant_isolation ON "Document";
DROP POLICY IF EXISTS tenant_isolation ON "GoogleDriveConnection";
DROP POLICY IF EXISTS tenant_isolation ON "Invitation";
DROP POLICY IF EXISTS tenant_isolation ON "MediaJob";
DROP POLICY IF EXISTS tenant_isolation ON "N8nConnection";
DROP POLICY IF EXISTS tenant_isolation ON "OAuthConnection";
DROP POLICY IF EXISTS tenant_isolation ON "OrganizationMember";
DROP POLICY IF EXISTS tenant_isolation ON "Project";
DROP POLICY IF EXISTS tenant_isolation ON "ReferralEvent";
DROP POLICY IF EXISTS tenant_isolation ON "StudioProject";
DROP POLICY IF EXISTS tenant_isolation ON "StudioSpendApproval";
DROP POLICY IF EXISTS tenant_isolation ON "Subscription";
DROP POLICY IF EXISTS tenant_isolation ON "UsageEvent";

DROP POLICY IF EXISTS tenant_isolation_via_chat ON "Message";
DROP POLICY IF EXISTS tenant_isolation_via_chat ON "Message_v2";
DROP POLICY IF EXISTS tenant_isolation_via_chat ON "Vote";
DROP POLICY IF EXISTS tenant_isolation_via_chat ON "Vote_v2";
DROP POLICY IF EXISTS tenant_isolation_via_chat ON "Stream";

DROP POLICY IF EXISTS public_read ON "BlogPost";

-- 2. Row level security back off
ALTER TABLE "AgentMessage"          DISABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSchedule"         DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Base44AgentSession"    DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Chat"                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Document"              DISABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleDriveConnection" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation"            DISABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaJob"              DISABLE ROW LEVEL SECURITY;
ALTER TABLE "N8nConnection"         DISABLE ROW LEVEL SECURITY;
ALTER TABLE "OAuthConnection"       DISABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationMember"    DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Project"               DISABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralEvent"         DISABLE ROW LEVEL SECURITY;
ALTER TABLE "StudioProject"         DISABLE ROW LEVEL SECURITY;
ALTER TABLE "StudioSpendApproval"   DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription"          DISABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageEvent"            DISABLE ROW LEVEL SECURITY;

ALTER TABLE "Message"    DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Message_v2" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Vote"       DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Vote_v2"    DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Stream"     DISABLE ROW LEVEL SECURITY;

-- 3. Grants added by 0046
REVOKE ALL ON
  "AgentLaunchPlan","AgentMessage","AgentSchedule","Base44AgentSession","Chat",
  "Document","GoogleDriveConnection","Invitation","MediaJob","N8nConnection",
  "OAuthConnection","OrganizationMember","Project","ReferralEvent","StudioProject",
  "StudioSpendApproval","Subscription","UsageEvent",
  "Message","Message_v2","Vote","Vote_v2","Stream"
FROM zooka_runtime;

REVOKE ALL ON "BlogPost"  FROM zooka_runtime;
REVOKE ALL ON "Organization" FROM zooka_runtime;
REVOKE ALL ON "User" FROM zooka_runtime;
REVOKE ALL ON "EmailVerificationToken" FROM zooka_runtime;
REVOKE ALL ON "PasswordResetToken" FROM zooka_runtime;
REVOKE ALL ON "Suggestion" FROM zooka_runtime;
REVOKE ALL ON "WebhookEvent" FROM zooka_runtime;
REVOKE ALL ON "GuestUsage" FROM zooka_runtime;
REVOKE ALL ON "Affiliate" FROM zooka_runtime;

COMMIT;
