-- Cloud projects for the studio: one row per saved template per workspace.
-- Applied to production (Supabase, PG 17.6) on 2026-11-02; written here so any
-- fresh environment gets the same table as lib/db/schema.ts.
CREATE TABLE IF NOT EXISTS "StudioProject" (
	"id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
	"organizationId" uuid NOT NULL,
	"name" text NOT NULL,
	"html" text NOT NULL,
	"createdAt" timestamp NOT NULL DEFAULT now(),
	"updatedAt" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "StudioProject_organizationId_Organization_id_fk"
		FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "StudioProject_organizationId_idx" ON "StudioProject" ("organizationId");
