-- 0061_mail_ledger_tenant_policies
--
-- Measured defect this file closes: on a database built from the migration files
-- alone, six tenant tables carry row level security but no policy at all -
-- MailAddress, MailMessage, MailDraft, MailAttachment, MailAudit and
-- RewardLedger. RLS without a policy is deny-all, so the restricted runtime role
-- reads zero rows from every one of them and cannot write either. Today that is
-- invisible because the application still connects as the owner, which bypasses
-- RLS; the moment it is cut over to zooka_runtime the whole mail feature and the
-- rewards ledger fail closed for every customer.
--
-- The predicate is deliberately identical to the one the other tenant tables
-- already use, so a row is visible exactly when the session is scoped to its
-- organization. Changing where that scope comes from (a signed claim instead of a
-- settable variable) is a separate, wider change and is not smuggled in here.
--
-- The block is dynamic on purpose: RewardLedger is not in the Drizzle schema, so
-- the file checks for the tenant column before touching the table and skips any
-- table that does not have it instead of failing the migration.

do $$
declare
  target text;
  candidates text[] := array[
    'MailAddress',
    'MailMessage',
    'MailDraft',
    'MailAttachment',
    'MailAudit',
    'RewardLedger'
  ];
begin
  foreach target in array candidates loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target
        and column_name = 'organizationId'
    ) then
      execute format('alter table public.%I enable row level security', target);
      execute format('drop policy if exists tenant_isolation on public.%I', target);
      execute format(
        'create policy tenant_isolation on public.%I for all '
        'using (("organizationId")::text = current_setting(''app.organization_id''::text, true)) '
        'with check (("organizationId")::text = current_setting(''app.organization_id''::text, true))',
        target
      );
    end if;
  end loop;
end $$;

-- Grants, for the same reason the policies are needed: 0058 granted the tenant
-- tables that existed when it ran, and the mail tables are created later by
-- 0060, so they were left with no privilege at all. Measured: as zooka_runtime
-- every read and write on MailAddress failed with 42501 permission denied before
-- row level security was even consulted. SELECT/INSERT/UPDATE follow 0058;
-- DELETE is withheld from the audit table because an audit row that can be
-- erased is not an audit trail.

do $$
declare
  target text;
  candidates text[] := array[
    'MailAddress',
    'MailMessage',
    'MailDraft',
    'MailAttachment',
    'MailAudit',
    'RewardLedger'
  ];
  audit_tables text[] := array['MailAudit'];
begin
  foreach target in array candidates loop
    if to_regclass(format('public.%I', target)) is not null then
      execute format('grant select, insert, update on table public.%I to zooka_runtime', target);
      if target = any (audit_tables) then
        execute format('revoke delete on table public.%I from zooka_runtime', target);
      else
        execute format('grant delete on table public.%I to zooka_runtime', target);
      end if;
    end if;
  end loop;
  execute 'grant select, usage on all sequences in schema public to zooka_runtime';
end $$;
