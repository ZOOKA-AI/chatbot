ALTER TABLE "WebhookEvent" ADD COLUMN IF NOT EXISTS "payload" json;
--> statement-breakpoint
DO $$ BEGIN
 LOCK TABLE "WebhookEvent" IN ACCESS EXCLUSIVE MODE;
 IF EXISTS (SELECT 1 FROM "WebhookEvent" WHERE length("externalId") > 255) THEN
  RAISE EXCEPTION 'WebhookEvent externalId exceeds 255 characters' USING ERRCODE = '22001';
 END IF;
 ALTER TABLE "WebhookEvent" ALTER COLUMN "externalId" TYPE varchar(255);
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = '"WebhookEvent"'::regclass
   AND conname = 'WebhookEvent_provider_externalId_key'
 ) THEN
  IF to_regclass('"WebhookEvent_provider_externalId_idx"') IS NOT NULL THEN
   ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_provider_externalId_key"
    UNIQUE USING INDEX "WebhookEvent_provider_externalId_idx";
  ELSE
   ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_provider_externalId_key"
    UNIQUE ("provider", "externalId");
  END IF;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "WebhookEvent_receivedAt_idx" ON "WebhookEvent" USING btree ("receivedAt");
