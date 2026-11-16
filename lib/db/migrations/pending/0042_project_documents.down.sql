-- Rollback for 0042. Drops only what this migration created, in reverse order: the tenant-coupling
-- constraint and the unique key it depends on, then the table. The documents themselves live here,
-- so the drop removes them.
DROP TABLE IF EXISTS "ProjectDocument";
ALTER TABLE "AgentProject" DROP CONSTRAINT IF EXISTS "AgentProject_id_organizationId_key";
