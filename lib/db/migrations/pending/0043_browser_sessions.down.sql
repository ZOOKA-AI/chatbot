-- Rollback for 0043. Evidence and events cascade with their session, so dropping the session table
-- removes the whole record of the browser having run. Screenshot files on disk are not removed by
-- the database and must be cleared separately.
DROP TABLE IF EXISTS "BrowserEvidence";
DROP TABLE IF EXISTS "BrowserEvent";
DROP TABLE IF EXISTS "BrowserSession";
