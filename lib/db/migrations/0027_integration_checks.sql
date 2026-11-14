CREATE TABLE IF NOT EXISTS "IntegrationCheck" (
 "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
 "provider" varchar(64) NOT NULL,
 "fingerprint" varchar(64) NOT NULL,
 "state" varchar(16) NOT NULL,
 "code" varchar(40) NOT NULL,
 "checkedAt" timestamp DEFAULT now() NOT NULL,
 CONSTRAINT "IntegrationCheck_organizationId_provider_pk" PRIMARY KEY ("organizationId", "provider")
);
--> statement-breakpoint
ALTER TABLE "IntegrationCheck" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
  REVOKE ALL ON TABLE "IntegrationCheck" FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
  REVOKE ALL ON TABLE "IntegrationCheck" FROM authenticated;
 END IF;
END $$;
