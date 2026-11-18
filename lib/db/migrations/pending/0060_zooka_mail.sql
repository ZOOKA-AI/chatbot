-- ZOOKA Mail: unified inbox, address reservation, AI assistance.
--
-- Access model follows 0055: RLS is enabled on every table and no policy is
-- created, so the restricted runtime role can neither read nor write these
-- tables. All access goes through server code that resolves the workspace from
-- the session (never from the request body), so a caller cannot choose a tenant.
--
-- The address itself is the product, so uniqueness is enforced by the database
-- rather than by a read-then-write check: two concurrent reservations of the
-- same username must resolve to exactly one winner, and ON CONFLICT DO NOTHING
-- is the only way to get that guarantee without a race.

CREATE TABLE IF NOT EXISTS "MailAddress" (
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
  -- Lower case only: the unique index is what makes "Ali" and "ali" one name.
  CONSTRAINT "MailAddress_localPart_lower_check" CHECK ("localPart" = lower("localPart")),
  CONSTRAINT "MailAddress_address_shape_check" CHECK ("address" = "localPart" || '@zooka-ai.com'),
  CONSTRAINT "MailAddress_status_check" CHECK ("status" IN ('reserved', 'active', 'suspended')),
  CONSTRAINT "MailAddress_provider_check" CHECK ("provider" IN ('hosted', 'gmail', 'outlook'))
);

CREATE INDEX IF NOT EXISTS "MailAddress_organizationId_idx" ON "MailAddress" ("organizationId");
CREATE INDEX IF NOT EXISTS "MailAddress_userId_idx" ON "MailAddress" ("userId");

CREATE TABLE IF NOT EXISTS "MailMessage" (
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
  -- Stored already sanitised by lib/mail/sanitize.ts; the column is never fed
  -- raw provider HTML, and it is re-sanitised on read as a second line.
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "MailMessage_provider_message_key"
  ON "MailMessage" ("organizationId", "provider", "providerMessageId")
  WHERE "providerMessageId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "MailMessage_folder_idx"
  ON "MailMessage" ("organizationId", "mailAddressId", "folder", "receivedAt");

CREATE TABLE IF NOT EXISTS "MailDraft" (
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
);

CREATE INDEX IF NOT EXISTS "MailDraft_owner_idx"
  ON "MailDraft" ("organizationId", "userId", "status");

CREATE TABLE IF NOT EXISTS "MailAttachment" (
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
);

CREATE INDEX IF NOT EXISTS "MailAttachment_message_idx" ON "MailAttachment" ("messageId");

CREATE TABLE IF NOT EXISTS "MailAudit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "userId" uuid,
  "action" varchar(48) NOT NULL,
  -- Never a body, a subject or a full address: the audit answers "who did what",
  -- and must not become a second copy of the mailbox if it is ever read.
  "targetId" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "MailAudit_organization_created_idx"
  ON "MailAudit" ("organizationId", "createdAt");

ALTER TABLE "MailAddress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailAudit" ENABLE ROW LEVEL SECURITY;
