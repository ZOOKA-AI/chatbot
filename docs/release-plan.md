# Zooka SaaS release plan

This repository change establishes a reviewable SaaS foundation: the existing
chat, model routing, workspace billing and quotas, and built-in tools remain in
place, with navigation grouped into Agents, Work, and Workspace. The work
assistant provides task presets and reports actual tool outcomes. Google Drive
read-only OAuth is implemented but remains unavailable until its server
credentials and encryption key are configured. Notion and Shopify remain
unavailable. This work is not deployed. Native iOS and Android support is not
included.
Agent mode also includes task templates tied to configured tool-capable models,
clear progress guidance, localized API errors, and a server refresh of
workspace quota state after an Agent run or quota rejection.

The build command runs database migrations. Before using Vercel Preview for
this branch, set its `POSTGRES_URL` to an isolated preview database rather than
the production database; this project's Vercel database settings could not be
verified during this review.

Ship each follow-up as an independently deployable, stable increment, targeting
about 10 days between releases:

1. **Connector configuration and expansion:** for Google Drive, set
   `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`,
   `GOOGLE_DRIVE_REDIRECT_URI`, and a fresh 32-byte base64
   `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` in the deployment's secret manager. The
   OAuth client must enable the Google Drive API, use a configured consent
   screen, and register the exact callback URI
   `/api/integrations/google-drive/callback`. Production use may require Google
   OAuth app verification for the read-only Drive scope. The app requests only
   `drive.readonly`, validates state and PKCE, stores encrypted tokens per
   workspace, and attempts revocation on disconnect. Local tokens are removed
   regardless; if Google does not confirm revocation, the UI directs the admin
   to remove the grant in Google Account permissions. Add Notion and Shopify
   only in later reviewed slices.
2. **Pages builder, public API, and embed:** design access controls, publishing,
   rate limits, and tenant-scoped API behavior before exposing public content.
3. **PWA and mobile packaging:** evaluate responsive web/PWA behavior first;
   native packaging remains a separate release.
4. **Legacy Supabase review and migration:** do not restore or mutate legacy
   data. Begin only after the old project is accessible and its ownership,
   schema, and data responsibilities have been verified; then plan a reviewed,
   reversible migration.

No production infrastructure or secrets were changed as part of this
foundation release. The branch contains additive database migrations; do not
run them against production until the preview database isolation and migration
plan are confirmed.
