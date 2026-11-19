-- Per-agent tool assignment and system instructions.
--
-- Both columns are nullable and every existing row stays valid: NULL allowedTools means
-- "unrestricted", which is exactly how every agent behaved before the column existed. An
-- array is a restriction, and an empty array is refused by the API rather than stored,
-- because an agent allowed to run nothing is a misconfiguration, not a policy.

ALTER TABLE "AgentIdentity" ADD COLUMN IF NOT EXISTS "allowedTools" json;
ALTER TABLE "AgentIdentity" ADD COLUMN IF NOT EXISTS "instructions" text;

-- Verification block: fail loudly if the columns did not land, rather than leaving a
-- deployment that looks applied but silently rejects every tool write.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AgentIdentity' AND column_name = 'allowedTools'
  ) THEN
    RAISE EXCEPTION 'AgentIdentity.allowedTools missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AgentIdentity' AND column_name = 'instructions'
  ) THEN
    RAISE EXCEPTION 'AgentIdentity.instructions missing after migration';
  END IF;
END $$;
