# Zooka SaaS release plan

This repository change establishes the first reviewable SaaS foundation: the
existing chat, model routing, workspace billing and quotas, and built-in tools
remain in place, with navigation grouped into Agents, Work, and Workspace.
Google Drive, Notion, and Shopify are unavailable in this release. No external
OAuth credentials are requested or stored, and this work is not deployed.
Native iOS and Android support is not included.

Ship each follow-up as an independently deployable, stable increment, targeting
about 10 days between releases:

1. **Connector expansion and settings:** implement the Google Drive read-only
   slice before showing a connected state. Use `drive.metadata.readonly` for
   metadata-only access; reading file contents requires the broader but
   read-only `drive.readonly` scope. Do not use `drive.file`, which also grants
   mutation rights. Validate OAuth state and PKCE, use workspace-owned
   connections, encrypted server-only token storage, safe
   refresh/revocation/disconnect handling, and tenant-isolation tests. Configure
   the Google Drive API, consent screen, and callback URI in the provider and
   deployment consoles. Document environment variable names such as
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
   `INTEGRATION_TOKEN_ENCRYPTION_KEY` without committing their values. Verify
   scopes against the [Drive API scope reference](https://developers.google.com/drive/api/guides/api-scopes).
   Add Notion and Shopify only in later reviewed slices.
2. **Pages builder, public API, and embed:** design access controls, publishing,
   rate limits, and tenant-scoped API behavior before exposing public content.
3. **PWA and mobile packaging:** evaluate responsive web/PWA behavior first;
   native packaging remains a separate release.
4. **Legacy Supabase review and migration:** do not restore or mutate legacy
   data. Begin only after the old project is accessible and its ownership,
   schema, and data responsibilities have been verified; then plan a reviewed,
   reversible migration.

No production infrastructure, secrets, or database changes are part of this
foundation release.
