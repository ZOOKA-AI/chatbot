-- ZOOKA-AI P0 — Agent Core schema (DEVELOPMENT ONLY)
-- لا يُطبَّق على الإنتاج. يُطبَّق على zooka-dev ثم يُرقّى بقرار مستقل.
-- كله idempotent: IF NOT EXISTS / DO blocks.

create extension if not exists pgcrypto;

-- 1) تشغيل الوكيل
create table if not exists "AgentRun" (
  id uuid primary key default gen_random_uuid(),
  "organizationId" uuid not null,
  "userId" uuid,
  "agentKey" text not null,
  status text not null default 'queued',
  "inputSummary" text,
  "startedAt" timestamptz not null default now(),
  "endedAt" timestamptz,
  tokens int not null default 0,
  "costUsd" numeric(12,6) not null default 0,
  "budgetCapAed" numeric(12,2),
  "killSwitchScope" text
);
create index if not exists "AgentRun_org_started_idx" on "AgentRun" ("organizationId","startedAt" desc);
create index if not exists "AgentRun_status_idx" on "AgentRun" (status);

-- 2) خطوات التشغيل (كل أداة ونتيجتها)
create table if not exists "AgentStep" (
  id uuid primary key default gen_random_uuid(),
  "runId" uuid not null references "AgentRun"(id) on delete cascade,
  seq int not null,
  "toolKey" text not null,
  "argsRedacted" jsonb not null default '{}'::jsonb,
  status text not null default 'ok',
  "resultSummary" text,
  "latencyMs" int,
  "errorCode" text,
  "createdAt" timestamptz not null default now(),
  unique ("runId", seq)
);
create index if not exists "AgentStep_run_idx" on "AgentStep" ("runId", seq);

-- 3) بوابة الموافقة
create table if not exists "AgentApproval" (
  id uuid primary key default gen_random_uuid(),
  "organizationId" uuid not null,
  "runId" uuid references "AgentRun"(id) on delete cascade,
  "toolKey" text not null,
  payload jsonb not null default '{}'::jsonb,
  decision text not null default 'pending',
  "decidedBy" text,
  "decidedAt" timestamptz,
  "requestedAt" timestamptz not null default now(),
  "expiresAt" timestamptz
);
create index if not exists "AgentApproval_pending_idx" on "AgentApproval" ("organizationId", decision, "requestedAt" desc);

-- 4) سياسة كل وكيل
create table if not exists "AgentPolicy" (
  id uuid primary key default gen_random_uuid(),
  "organizationId" uuid not null,
  "agentKey" text not null,
  "allowTools" text[] not null default '{}',
  "denyTools" text[] not null default '{}',
  "requiresApproval" text[] not null default '{}',
  "maxDailySpendAed" numeric(12,2) not null default 0,
  "maxMonthlySpendAed" numeric(12,2) not null default 0,
  enabled boolean not null default true,
  "updatedAt" timestamptz not null default now(),
  unique ("organizationId","agentKey")
);

-- 5) ربط المزوّدين (مرجع سر فقط)
create table if not exists "IntegrationConnection" (
  id uuid primary key default gen_random_uuid(),
  "organizationId" uuid not null,
  provider text not null,
  "accountRef" text,
  scopes text[] not null default '{}',
  "secretRef" text not null,
  status text not null default 'connected',
  "lastCheckedAt" timestamptz,
  "expiresAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  unique ("organizationId", provider, "accountRef")
);

-- 6) أحداث التكامل
create table if not exists "IntegrationEvent" (
  id uuid primary key default gen_random_uuid(),
  "connectionId" uuid references "IntegrationConnection"(id) on delete cascade,
  type text not null,
  "payloadRedacted" jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now()
);
create index if not exists "IntegrationEvent_conn_idx" on "IntegrationEvent" ("connectionId","createdAt" desc);

-- 7) حسابات الإعلان
create table if not exists "AdAccount" (
  id uuid primary key default gen_random_uuid(),
  "organizationId" uuid not null,
  provider text not null,
  "externalId" text not null,
  currency text not null default 'AED',
  "spendCapAed" numeric(12,2) not null default 0,
  status text not null default 'active',
  unique ("organizationId", provider, "externalId")
);

-- 8) الحملات
create table if not exists "Campaign" (
  id uuid primary key default gen_random_uuid(),
  "adAccountId" uuid not null references "AdAccount"(id) on delete cascade,
  "externalId" text,
  name text not null,
  objective text,
  "budgetAed" numeric(12,2) not null default 0,
  status text not null default 'draft',
  "policyState" text not null default 'ok',
  "updatedAt" timestamptz not null default now()
);

-- 9) تعديلات الحملات (اقتراح ← موافقة ← تنفيذ)
create table if not exists "CampaignChange" (
  id uuid primary key default gen_random_uuid(),
  "campaignId" uuid not null references "Campaign"(id) on delete cascade,
  "proposedBy" text not null,
  diff jsonb not null,
  decision text not null default 'pending',
  "approvedBy" text,
  "executedAt" timestamptz,
  result text
);

-- 10) دفتر الصرف
create table if not exists "SpendLedger" (
  id uuid primary key default gen_random_uuid(),
  "organizationId" uuid not null,
  day date not null,
  provider text not null,
  "amountAed" numeric(12,2) not null default 0,
  "runId" uuid references "AgentRun"(id) on delete set null,
  unique ("organizationId", day, provider)
);

-- 11) سجل تدقيق بإضافة فقط
create table if not exists "AuditLog" (
  id bigserial primary key,
  "organizationId" uuid,
  actor text not null,
  "actorRef" text,
  action text not null,
  "targetType" text,
  "targetId" text,
  before jsonb,
  after jsonb,
  "at" timestamptz not null default now()
);
create index if not exists "AuditLog_org_at_idx" on "AuditLog" ("organizationId","at" desc);

-- منع التعديل والحذف على سجل التدقيق
create or replace function audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'AuditLog is append-only: % is forbidden', tg_op;
end $$;

drop trigger if exists audit_log_no_update on "AuditLog";
create trigger audit_log_no_update before update on "AuditLog"
  for each row execute function audit_log_immutable();
drop trigger if exists audit_log_no_delete on "AuditLog";
create trigger audit_log_no_delete before delete on "AuditLog"
  for each row execute function audit_log_immutable();

-- عزل: RLS على كل الجداول الجديدة + سحب صلاحيات anon/authenticated (نمط الإنتاج)
do $$
declare t text;
begin
  foreach t in array array['AgentRun','AgentStep','AgentApproval','AgentPolicy','IntegrationConnection',
                           'IntegrationEvent','AdAccount','Campaign','CampaignChange','SpendLedger','AuditLog']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
  execute 'revoke all on sequence "AuditLog_id_seq" from anon, authenticated';
end $$;

-- تحقق ذاتي: يفشل الترحيل لو الجداول ناقصة
do $$
declare missing text;
begin
  select string_agg(x, ',') into missing from unnest(array['AgentRun','AgentStep','AgentApproval','AgentPolicy',
    'IntegrationConnection','IntegrationEvent','AdAccount','Campaign','CampaignChange','SpendLedger','AuditLog']) x
    where to_regclass('public.'||quote_ident(x)) is null;
  if missing is not null then raise exception 'missing tables: %', missing; end if;
end $$;
