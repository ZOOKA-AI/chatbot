-- 0062_policy_subject_membership
--
-- Measured weakness this file closes: every tenant policy compares the row's
-- organizationId with a session variable, current_setting('app.organization_id').
-- That variable is set by the application, not by the database, and nothing ties
-- it to an authenticated person. An authenticated request that sets the variable
-- to another workspace's id reads that workspace's rows. The isolated rehearsal
-- showed it plainly: with the context forged to B, B's row came back.
--
-- The fix keeps the existing predicate and adds a second condition that is not
-- under the caller's control: the authenticated subject (request.jwt.claims.sub,
-- written by the tenant runners inside the same transaction) must actually be a
-- member of the organization the session claims. A forged variable now yields
-- zero rows instead of another tenant's data.
--
-- Deliberately not a breaking change: when no subject is present - service and
-- admin paths that never set claims - app_is_org_member() returns true and the
-- old behaviour stands. Those paths already run on the owner connection, which
-- bypasses row level security entirely, so they gain nothing from a deny.
--
-- Every policy is rebuilt with its original name, command and roles; a SELECT
-- policy is not widened into FOR ALL.

create or replace function public.app_tenant_subject() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claim.sub', true), '')
  )
$$;

-- SECURITY DEFINER on purpose: the lookup reads OrganizationMember, which carries
-- the very policies this function guards. Running it as the owner bypasses row
-- level security for that one read, which is what stops the recursion
-- (measured: without it every tenant read died with "stack depth limit exceeded").
-- The search_path is pinned so a caller cannot shadow the table or the function.
create or replace function public.app_is_org_member(org text) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when org is null or org = '' then false
    when public.app_tenant_subject() is null then true
    else exists (
      select 1
      from public."OrganizationMember" m
      where m."organizationId"::text = org
        and m."userId"::text = public.app_tenant_subject()
    )
  end
$$;

do $$
declare
  p record;
  guard text := 'public.app_is_org_member(current_setting(''app.organization_id''::text, true))';
  new_qual text;
  new_check text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and qual like '%app.organization_id%'
  loop
    -- Each policy keeps its own logic; the guard is appended, never substituted.
    -- Replacing the expression outright broke the policies on tables that carry no
    -- organizationId column (User resolves membership through a subquery).
    new_qual := format('(%s) and %s', p.qual, guard);
    new_check := case when p.with_check is null then null else format('(%s) and %s', p.with_check, guard) end;

    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);

    if p.cmd = 'ALL' then
      execute format('create policy %I on %I.%I for all to %s using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, array_to_string(p.roles, ', '), new_qual, coalesce(new_check, new_qual));
    elsif p.cmd = 'SELECT' then
      execute format('create policy %I on %I.%I for select to %s using (%s)',
        p.policyname, p.schemaname, p.tablename, array_to_string(p.roles, ', '), new_qual);
    elsif p.cmd = 'INSERT' then
      execute format('create policy %I on %I.%I for insert to %s with check (%s)',
        p.policyname, p.schemaname, p.tablename, array_to_string(p.roles, ', '), coalesce(new_check, new_qual));
    elsif p.cmd = 'UPDATE' then
      execute format('create policy %I on %I.%I for update to %s using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, array_to_string(p.roles, ', '), new_qual, coalesce(new_check, new_qual));
    elsif p.cmd = 'DELETE' then
      execute format('create policy %I on %I.%I for delete to %s using (%s)',
        p.policyname, p.schemaname, p.tablename, array_to_string(p.roles, ', '), new_qual);
    end if;
  end loop;
end $$;
