-- 0049_runtime_app_grants.sql
--
-- The runtime role `zooka_runtime` could not read or write most application
-- tables: only the six Agent* tables had grants, so the first real request under
-- TENANT_RLS_ENABLED=on failed with "permission denied for table
-- OrganizationMember" while enriching the session. RLS policies existed on 38
-- tables but were unreachable without privileges.
--
-- This migration grants the runtime role the privileges the application actually
-- uses, and refuses to run if any granted table has Row Level Security disabled,
-- because a grant without a policy is an open door between tenants.
--
-- `User` and `Organization` are handled separately and deliberately narrowly:
-- they are read by the auth/session path before a tenant context exists, so they
-- get SELECT only. They remain a documented gap (see KNOWN GAPS below); enabling
-- RLS on them requires the session path to run inside a tenant transaction first.

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
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t
    ) then
      raise notice 'skip % (table absent)', t;
      continue;
    end if;
    if not (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = t) then
      -- Fail closed: granting on a table without RLS would let one workspace
      -- read another's rows.
      raise exception 'refusing to grant on % : row level security is not enabled', t;
    end if;
    execute format('grant select, insert, update, delete on public.%I to zooka_runtime', t);
  end loop;
end $$;

-- Read-only, and only where the session/auth path needs it (KNOWN GAPS):
-- neither table has RLS yet, so no write privilege is given to the runtime role.
grant select on public."User" to zooka_runtime;
grant select on public."Organization" to zooka_runtime;

grant usage, select on all sequences in schema public to zooka_runtime;

commit;
