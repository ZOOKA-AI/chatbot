-- Provider-agnostic OAuth connection store (GitHub, Vercel).
-- Applied to Supabase project krzfrsaquvmwctsajhlm.
-- Tokens are AES-256-GCM ciphertext produced by lib/integrations/google-drive/crypto.ts,
-- so the database never holds a usable access token.

CREATE TABLE IF NOT EXISTS "OAuthConnection" (
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  provider varchar(32) NOT NULL,
  "encryptedTokens" text NOT NULL,
  "accountId" text,
  "accountName" text,
  "avatarUrl" text,
  scopes text,
  "tokenExpiresAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "OAuthConnection_organizationId_provider_pk" PRIMARY KEY ("organizationId", provider)
);

CREATE INDEX IF NOT EXISTS "OAuthConnection_provider_idx" ON "OAuthConnection" (provider);
