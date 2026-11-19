CREATE TABLE IF NOT EXISTS "MediaJob" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"actionType" varchar(16) NOT NULL,
	"prompt" text NOT NULL,
	"status" varchar DEFAULT 'queued' NOT NULL,
	"assetUrl" text,
	"error" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MediaJob" ADD CONSTRAINT "MediaJob_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
