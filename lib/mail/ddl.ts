/**
 * The exact statements of migration 0059, in the order they must run.
 *
 * The admin migration route applies a named list of statements, so the DDL has to
 * exist as code. Keeping a second copy in lib/db/migrations/pending/0059_zooka_mail.sql
 * is what makes it reviewable in a pull request, and tests/unit/mail-migration.test.ts
 * fails if the two ever disagree. Nothing here runs automatically: applying it needs
 * the owner-approved migration call.
 */

export const MAIL_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "MailAddress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "localPart" varchar(64) NOT NULL,
  "address" varchar(254) NOT NULL,
  "status" varchar(16) DEFAULT 'reserved' NOT NULL,
  "provider" varchar(16) DEFAULT 'hosted' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "MailAddress_localPart_key" UNIQUE ("localPart"),
  CONSTRAINT "MailAddress_address_key" UNIQUE ("address"),
  CONSTRAINT "MailAddress_localPart_lower_check" CHECK ("localPart" = lower("localPart")),
  CONSTRAINT "MailAddress_address_shape_check" CHECK ("address" = "localPart" || '@zooka-ai.com'),
  CONSTRAINT "MailAddress_status_check" CHECK ("status" IN ('reserved', 'active', 'suspended')),
  CONSTRAINT "MailAddress_provider_check" CHECK ("provider" IN ('hosted', 'gmail', 'outlook'))
)`,
  `CREATE INDEX IF NOT EXISTS "MailAddress_organizationId_idx" ON "MailAddress" ("organizationId")`,
  `CREATE INDEX IF NOT EXISTS "MailAddress_userId_idx" ON "MailAddress" ("userId")`,
  `CREATE TABLE IF NOT EXISTS "MailMessage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "mailAddressId" uuid NOT NULL REFERENCES "MailAddress"("id") ON DELETE CASCADE,
  "provider" varchar(16) DEFAULT 'hosted' NOT NULL,
  "providerMessageId" text,
  "threadId" text,
  "direction" varchar(8) DEFAULT 'inbound' NOT NULL,
  "folder" varchar(12) DEFAULT 'inbox' NOT NULL,
  "fromAddress" varchar(254) NOT NULL,
  "fromName" text,
  "toAddresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "subject" text,
  "snippet" text,
  "bodyHtml" text,
  "bodyText" text,
  "receivedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "isRead" boolean DEFAULT false NOT NULL,
  "hasAttachments" boolean DEFAULT false NOT NULL,
  "aiSummary" text,
  "aiSummaryAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "MailMessage_direction_check" CHECK ("direction" IN ('inbound', 'outbound')),
  CONSTRAINT "MailMessage_folder_check" CHECK ("folder" IN ('inbox', 'sent', 'drafts', 'archive'))
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MailMessage_provider_message_key"
  ON "MailMessage" ("organizationId", "provider", "providerMessageId")
  WHERE "providerMessageId" IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "MailMessage_folder_idx"
  ON "MailMessage" ("organizationId", "mailAddressId", "folder", "receivedAt")`,
  `CREATE TABLE IF NOT EXISTS "MailDraft" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "mailAddressId" uuid NOT NULL REFERENCES "MailAddress"("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "toAddresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "subject" text,
  "bodyText" text,
  "aiGenerated" boolean DEFAULT false NOT NULL,
  "status" varchar(12) DEFAULT 'draft' NOT NULL,
  "sentMessageId" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "MailDraft_status_check" CHECK ("status" IN ('draft', 'sent', 'discarded'))
)`,
  `CREATE INDEX IF NOT EXISTS "MailDraft_owner_idx"
  ON "MailDraft" ("organizationId", "userId", "status")`,
  `CREATE TABLE IF NOT EXISTS "MailAttachment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "messageId" uuid NOT NULL REFERENCES "MailMessage"("id") ON DELETE CASCADE,
  "filename" varchar(255) NOT NULL,
  "contentType" varchar(128) NOT NULL,
  "sizeBytes" integer NOT NULL,
  "storageKey" text,
  "status" varchar(12) DEFAULT 'pending' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "MailAttachment_status_check" CHECK ("status" IN ('pending', 'stored', 'rejected'))
)`,
  `CREATE INDEX IF NOT EXISTS "MailAttachment_message_idx" ON "MailAttachment" ("messageId")`,
  `CREATE TABLE IF NOT EXISTS "MailAudit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "userId" uuid,
  "action" varchar(48) NOT NULL,
  "targetId" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "MailAudit_organization_created_idx"
  ON "MailAudit" ("organizationId", "createdAt")`,
  `ALTER TABLE "MailAddress" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "MailMessage" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "MailDraft" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "MailAttachment" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "MailAudit" ENABLE ROW LEVEL SECURITY`,
];
