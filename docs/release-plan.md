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
   slice before showing a connected state. Use minimal OAuth scopes, validated
   state and PKCE, workspace-owned connections, encrypted server-only token
   storage, safe refresh/revocation/disconnect handling, and tenant-isolation
   tests. Add Notion and Shopify only in later reviewed slices. Define any
   required environment variable names and setup steps without committing
   credentials.
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
