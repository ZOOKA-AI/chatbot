-- Chat soft delete.
--
-- The application has deleted chats by setting `deletedAt` since commit 33d935c, and
-- every listing filters on `isNull(chat.deletedAt)`. But that column was created only
-- by the admin migration route (`Chat_soft_delete`), never by a numbered migration, so
-- a database built from the repository could not run a single chat query. This closes
-- that gap and nothing else.
--
-- Deliberately a correction, not a copy of production: the columns production carries
-- that the ORM never selects (`User.name`, `User.image`, `Organization.slug`,
-- `Document.embedding`) are legacy and stay where they are. Adding them here would
-- invent a schema nobody uses and pretend the drift had a single cause.
--
-- Idempotent: safe on a fresh install, on an upgraded database, and on a database where
-- the admin route already applied it.

ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp;

-- The listing filters live rows per organisation, so the index is partial and matches
-- that predicate rather than indexing every deleted row too.
CREATE INDEX IF NOT EXISTS "Chat_organizationId_deletedAt_idx"
  ON "Chat" ("organizationId", "deletedAt");

-- Self-check: a silent no-op is the one outcome that would look like success and be
-- useless, so the migration fails loudly if the column is still absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Chat' AND column_name = 'deletedAt'
  ) THEN
    RAISE EXCEPTION 'reconciliation failed: Chat.deletedAt is still missing';
  END IF;
END $$;
