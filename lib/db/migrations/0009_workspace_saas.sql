CREATE TABLE IF NOT EXISTS "Invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"invitedBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"acceptedAt" timestamp,
	CONSTRAINT "Invitation_organizationId_email_unique" UNIQUE("organizationId","email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrganizationMember" (
	"organizationId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "OrganizationMember_organizationId_userId_pk" PRIMARY KEY("organizationId","userId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"plan" varchar DEFAULT 'free' NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"externalCustomerId" text,
	"externalSubscriptionId" text,
	"periodEnd" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Subscription_organizationId_unique" UNIQUE("organizationId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UsageEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"event" varchar(64) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "Organization" ("id", "name")
SELECT "id", COALESCE(NULLIF(split_part("email", '@', 1), ''), 'Workspace') || '''s workspace'
FROM "User";
--> statement-breakpoint
INSERT INTO "OrganizationMember" ("organizationId", "userId", "role")
SELECT "id", "id", 'owner' FROM "User";
--> statement-breakpoint
INSERT INTO "Subscription" ("organizationId", "plan", "status")
SELECT "id", 'free', 'active' FROM "Organization";
--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN "organizationId" uuid;
--> statement-breakpoint
ALTER TABLE "Document" ADD COLUMN "organizationId" uuid;
--> statement-breakpoint
UPDATE "Chat" AS c
SET "organizationId" = m."organizationId"
FROM "OrganizationMember" AS m
WHERE c."userId" = m."userId";
--> statement-breakpoint
UPDATE "Document" AS d
SET "organizationId" = m."organizationId"
FROM "OrganizationMember" AS m
WHERE d."userId" = m."userId";
--> statement-breakpoint
ALTER TABLE "Chat" ALTER COLUMN "organizationId" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "Document" ALTER COLUMN "organizationId" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedBy_User_id_fk" FOREIGN KEY ("invitedBy") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invitation_organizationId_idx" ON "Invitation" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OrganizationMember_userId_idx" ON "OrganizationMember" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "UsageEvent_organizationId_createdAt_idx" ON "UsageEvent" USING btree ("organizationId","createdAt");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Chat" ADD CONSTRAINT "Chat_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Chat_organizationId_createdAt_idx" ON "Chat" USING btree ("organizationId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Document_organizationId_idx" ON "Document" USING btree ("organizationId");