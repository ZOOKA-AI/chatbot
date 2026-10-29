CREATE TABLE IF NOT EXISTS "GoogleDriveConnection" (
	"organizationId" uuid PRIMARY KEY NOT NULL,
	"encryptedTokens" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "GoogleDriveConnection" ADD CONSTRAINT "GoogleDriveConnection_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;