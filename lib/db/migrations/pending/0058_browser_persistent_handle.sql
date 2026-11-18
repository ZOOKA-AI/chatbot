-- 0058_browser_persistent_handle (PENDING, not applied)
--
-- Why: on 18.11.2026 a real Chromium proved that a browser context created through the DevTools
-- protocol survives the death of the process that created it (context id and tab id unchanged, cookie,
-- local storage and title intact, tab still clickable). The same test proved the opposite for the
-- Playwright-owned context the app uses today: it is disposed with the connection.
--
-- Storing the two ids is what lets a later worker find that context again. Nothing else is added:
-- the endpoint is NOT stored, because BROWSER_CDP_URL may carry a token in its query string and a
-- session row must never become a credential store. The endpoint is read from the environment.
--
-- Risk: additive and nullable, no data rewrite, no policy change, no privilege change. Existing rows
-- keep working with NULL, and NULL simply means "this session is not resumable".
-- Rollback: pending/0058_browser_persistent_handle.down.sql (drops the metadata only; live sessions
-- are recreated on demand, no customer data lives in these columns).

ALTER TABLE "BrowserSession" ADD COLUMN IF NOT EXISTS "browserContextId" text;
ALTER TABLE "BrowserSession" ADD COLUMN IF NOT EXISTS "targetId" text;

CREATE INDEX IF NOT EXISTS "BrowserSession_target_idx"
  ON "BrowserSession" ("targetId")
  WHERE "targetId" IS NOT NULL;
