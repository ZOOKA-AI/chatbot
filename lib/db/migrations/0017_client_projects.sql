CREATE TABLE IF NOT EXISTS "Project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"createdBy" uuid,
	"name" text NOT NULL,
	"subdomain" varchar(63) NOT NULL,
	"customDomain" varchar(253),
	"status" varchar(16) DEFAULT 'CREATING' NOT NULL,
	"templateId" text,
	"templateConfig" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Project_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Project_organizationId_idx" ON "Project" USING btree ("organizationId");