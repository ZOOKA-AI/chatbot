-- Execution history reads newest-first within one organisation.
-- The column order matches the query's ORDER BY exactly, so PostgreSQL can walk
-- the index instead of sorting, and the keyset boundary is a plain comparison.
CREATE INDEX IF NOT EXISTS "AgentTask_organizationId_createdAt_idx"
  ON "AgentTask" ("organizationId", "createdAt" DESC, "id" DESC);
