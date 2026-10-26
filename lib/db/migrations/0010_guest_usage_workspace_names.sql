CREATE TABLE IF NOT EXISTS "GuestUsage" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
UPDATE "Organization"
SET "name" = 'مساحة عمل جديدة'
WHERE "name" ~* '^(guest-?)?[0-9]{6,}(''s workspace)?$';
