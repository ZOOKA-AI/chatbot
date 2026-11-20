-- Reverts 0063. Drops every platform grant and the audit trail: export both first.
DROP TABLE IF EXISTS "PlatformAuditLog";
DROP TABLE IF EXISTS "PlatformRole";
