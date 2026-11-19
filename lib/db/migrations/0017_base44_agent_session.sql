-- Per-member Base44 Superagent conversation plus its metered consumption.
-- Applied to Supabase project krzfrsaquvmwctsajhlm.

CREATE TABLE IF NOT EXISTS "Base44AgentSession" (
  "userId" uuid PRIMARY KEY NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "conversationId" text NOT NULL,
  "turns" integer NOT NULL DEFAULT 0,
  "credits" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Base44AgentSession_org_idx"
  ON "Base44AgentSession" ("organizationId");
