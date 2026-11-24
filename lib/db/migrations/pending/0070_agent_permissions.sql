-- Add permission settings to the existing RLS-protected agent identity table.
-- Existing agents retain the product defaults; no policy or tenant boundary changes.
ALTER TABLE "AgentIdentity"
  ADD COLUMN IF NOT EXISTS "updateWithoutApproval" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deleteWithoutApproval" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sendMessagesWithoutApproval" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AgentIdentity' AND column_name = 'updateWithoutApproval'
  ) THEN
    RAISE EXCEPTION 'AgentIdentity.updateWithoutApproval missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AgentIdentity' AND column_name = 'deleteWithoutApproval'
  ) THEN
    RAISE EXCEPTION 'AgentIdentity.deleteWithoutApproval missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AgentIdentity' AND column_name = 'sendMessagesWithoutApproval'
  ) THEN
    RAISE EXCEPTION 'AgentIdentity.sendMessagesWithoutApproval missing after migration';
  END IF;
END $$;
