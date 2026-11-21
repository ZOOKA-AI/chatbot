create table if not exists "TikTokConnection" (
"id" uuid primary key default gen_random_uuid() not null,
"organizationId" uuid not null references "Organization"("id") on delete cascade,
"userId" uuid not null,
"openId" varchar(128) not null,
"displayName" varchar(200),
"avatarUrl" text,
"scopes" varchar(300),
"encryptedTokens" text not null,
"accessExpiresAt" timestamp,
"refreshExpiresAt" timestamp,
"createdAt" timestamp default now() not null,
"updatedAt" timestamp default now() not null,
constraint "TikTokConnection_organization_user_key" unique ("organizationId", "userId")
);

create index if not exists "TikTokConnection_organization_idx"
on "TikTokConnection" using btree ("organizationId");

create table if not exists "TikTokUpload" (
"id" uuid primary key default gen_random_uuid() not null,
"organizationId" uuid not null references "Organization"("id") on delete cascade,
"userId" uuid not null,
"publishId" varchar(128) not null,
"fileName" varchar(255) not null,
"fileSize" integer not null,
"mimeType" varchar(64) not null,
"status" varchar(32) default 'INIT' not null,
"failReason" varchar(200),
"uploadedBytes" integer,
"createdAt" timestamp default now() not null,
"updatedAt" timestamp default now() not null,
constraint "TikTokUpload_publish_key" unique ("publishId")
);

create index if not exists "TikTokUpload_owner_created_idx"
on "TikTokUpload" using btree ("organizationId", "userId", "createdAt");

alter table "TikTokConnection" enable row level security;

alter table "TikTokUpload" enable row level security;

create policy "TikTokConnection_tenant" on "TikTokConnection" for all
using (((("organizationId")::text = current_setting('app.organization_id'::text, true)) and public.app_is_org_member(current_setting('app.organization_id'::text, true))))
with check (((("organizationId")::text = current_setting('app.organization_id'::text, true)) and public.app_is_org_member(current_setting('app.organization_id'::text, true))));

create policy "TikTokUpload_tenant" on "TikTokUpload" for all
using (((("organizationId")::text = current_setting('app.organization_id'::text, true)) and public.app_is_org_member(current_setting('app.organization_id'::text, true))))
with check (((("organizationId")::text = current_setting('app.organization_id'::text, true)) and public.app_is_org_member(current_setting('app.organization_id'::text, true))));

grant select, insert, update, delete on table "TikTokConnection" to zooka_runtime;

grant select, insert, update, delete on table "TikTokUpload" to zooka_runtime;
