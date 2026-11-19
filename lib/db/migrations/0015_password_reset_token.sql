CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "tokenHash" varchar(64) PRIMARY KEY NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
