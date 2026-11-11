CREATE TABLE IF NOT EXISTS "WebhookEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"payload" json,
	"receivedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "WebhookEvent" ADD COLUMN IF NOT EXISTS "payload" json;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "WebhookEvent" ALTER COLUMN "externalId" TYPE varchar(255);
EXCEPTION
 WHEN others THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_provider_externalId_key" UNIQUE ("provider","externalId");
EXCEPTION
 WHEN duplicate_object THEN null;
 WHEN duplicate_table THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "WebhookEvent_receivedAt_idx" ON "WebhookEvent" USING btree ("receivedAt");
