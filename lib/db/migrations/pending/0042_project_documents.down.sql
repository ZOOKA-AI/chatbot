-- Rollback for 0042. Drops only what this migration created; the documents themselves live
-- here, so the drop removes them. That is the correct order: this table has no dependents.
DROP TABLE IF EXISTS "ProjectDocument";
