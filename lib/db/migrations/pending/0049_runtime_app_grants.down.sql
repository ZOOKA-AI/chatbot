-- 0049 down: take the runtime privileges back.
--
-- This restores the previous posture (runtime role limited to the six Agent*
-- tables). The application stops being able to serve authenticated requests while
-- the grants are absent, so this is a code-plus-rollback step, not a live fix:
-- run it only together with a rollback of the deployment that needs the grants.
-- No data is touched.

begin;

do $$
declare
  t text;
  hardened text[] := array[
    'AgentApproval','AgentDecision','AgentDeployment','AgentExecution','AgentIdentity',
    'AgentLaunchPlan','AgentMessage','AgentProject','AgentSchedule','AgentTask',
    'Base44AgentSession','BlogPost','BrowserEvent','BrowserEvidence','BrowserSession',
    'Chat','Document','GoogleDriveConnection','Invitation','MediaJob','Message','Message_v2',
    'N8nConnection','OAuthConnection','OrganizationMember','Project','ProjectDocument',
    'ReferralEvent','Stream','StudioAsset','StudioProject','StudioSpendApproval',
    'Subscription','Suggestion','UsageEvent','Vote','Vote_v2','integration_connection'
  ];
begin
  foreach t in array hardened loop
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t
    ) then
      execute format('revoke select, insert, update, delete on public.%I from zooka_runtime', t);
    end if;
  end loop;
end $$;

revoke select on public."User" from zooka_runtime;
revoke select on public."Organization" from zooka_runtime;

commit;
