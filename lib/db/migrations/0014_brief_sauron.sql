CREATE TABLE IF NOT EXISTS "Base44AgentSession" (
	"userId" uuid PRIMARY KEY NOT NULL,
	"organizationId" uuid NOT NULL,
	"conversationId" text NOT NULL,
	"turns" integer DEFAULT 0 NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "N8nConnection" (
	"organizationId" uuid PRIMARY KEY NOT NULL,
	"encryptedCredentials" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OAuthConnection" (
	"organizationId" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"encryptedTokens" text NOT NULL,
	"accountId" text,
	"accountName" text,
	"avatarUrl" text,
	"scopes" text,
	"tokenExpiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "OAuthConnection_organizationId_provider_pk" PRIMARY KEY("organizationId","provider")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
	"tokenHash" varchar(64) PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"usedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "StudioProject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"name" text NOT NULL,
	"html" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "WebhookEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"payload" json,
	"receivedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "WebhookEvent_provider_externalId_key" UNIQUE("provider","externalId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Base44AgentSession" ADD CONSTRAINT "Base44AgentSession_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Base44AgentSession" ADD CONSTRAINT "Base44AgentSession_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "N8nConnection" ADD CONSTRAINT "N8nConnection_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OAuthConnection" ADD CONSTRAINT "OAuthConnection_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "StudioProject" ADD CONSTRAINT "StudioProject_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OAuthConnection_provider_idx" ON "OAuthConnection" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "StudioProject_organizationId_idx" ON "StudioProject" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "WebhookEvent_receivedAt_idx" ON "WebhookEvent" USING btree ("receivedAt");