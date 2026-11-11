CREATE TABLE IF NOT EXISTS "MediaJob" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "actionType" varchar(16) NOT NULL,
  "prompt" text NOT NULL,
  "status" varchar(16) DEFAULT 'queued' NOT NULL,
  "assetUrl" text,
  "error" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "MediaJob_organizationId_createdAt_idx" ON "MediaJob" ("organizationId", "createdAt");
