CREATE TABLE IF NOT EXISTS "N8nConnection" (
  "organizationId" uuid PRIMARY KEY NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  "encryptedCredentials" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
