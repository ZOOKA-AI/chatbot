# Zooka AI SaaS development and Vercel cleanup

Continue the existing Zooka AI work on GitHub. The repository is
`ZOOKA-AI/chatbot`, the existing draft is PR #18, and its branch is
`copilot/build-zooka-saas-foundation`. Update that PR; do not create a duplicate
branch or PR.

## Product outcome

Build one stable, global SaaS product for `https://zooka-ai.com`. Keep the
experience responsive on desktop, web, and mobile browsers; make PWA/mobile
packaging a later compatible step. Organize the product around three areas:

1. **Agents** — real model-backed agents using only configured model IDs and
   tools the selected provider supports. The product uses Claude, Grok, OpenAI,
   and Gemini; verify the actual configured IDs in the repository rather than
   inventing model names.
2. **Work** — a useful work assistant, real connectors, settings, and the
   eventual pages/site builder. Report actual tool outcomes and errors; never
   present a placeholder as a working integration.
3. **Workspace** — account, members, roles, billing, usage, and tenant-scoped
   data.

Ship stable, independently reviewable slices at roughly ten-day intervals.
Keep the app global and domain-neutral; do not hard-code an UAE-only audience.

## Required work

1. Read the current app routes, auth and role checks, tenant data model, billing
   and quota flow, provider/model registry, integrations, deployment config,
   migrations, and existing tests. Keep the current canonical production
   project and `zooka-ai.com` working.
2. Finish the Agent and Work experience on the existing branch: usable task
   presets, visible progress, accurate tool-result reporting, localized
   errors, model-capability checks, and server-authoritative quotas. Add the
   settings and connector structure needed for later integrations.
3. Make the deploy build side-effect free. The current `package.json` build
   script invokes `lib/db/migrate` before `next build`. Separate application
   compilation from database migration; make migrations an explicit,
   environment-scoped release step. Preview migrations must use an isolated
   preview database. Never run production migrations from a preview build.
4. Inspect the Vercel team `zooka-ai1` (team id
   `team_uOQb9Ou08Aa2T0KkvfA65ghG`) and both known projects, `chatbot` and
   `zeker-app`. Inventory project IDs, Git repositories/branches/root
   directories/build commands, production and preview domains, aliases,
   deployment status and age, rollback candidates, and environment-variable
   **names and targets only**. Never print or copy secret values.
5. Identify Vercel cleanup candidates with evidence. Remove only deployments
   that are failed/cancelled, belong to closed or obsolete branches, have no
   domain alias, are not production, and are not rollback candidates. Treat
   `zeker-app` as a candidate to investigate, not as a presumed duplicate:
   preserve it if it owns a needed domain, production alias, active app, or
   required integration. Do not delete projects, domains, environment
   variables, databases, or storage merely because they look old. List each
   exact resource and its evidence before any deletion that could affect a
   project or production resource.
6. Determine why Vercel reports the account/deployment as blocked and what
   account-side action is required. Do not bypass account, team, billing, SSO,
   or deployment protection controls.
7. Treat the legacy Supabase project as read-only until its owner, schema,
   data, backups, and tenant boundaries are verified. Do not restore, merge,
   migrate, or delete legacy data in this slice.

## Working and release rules

- Keep PR #18 draft. Review and improve its current implementation instead of
  starting another PR.
- Run safe lint, type-check, and targeted tests. Build only with a confirmed
  isolated non-production database. Never read or print `.env` values.
- Ask GitHub Copilot to review the exact final commit. Fix actionable review
  findings and request another review. A review of an older commit does not
  satisfy this requirement.
- Do not merge or deploy to production until the preview database, migrations,
  Vercel account status, CI, and Copilot review are clear.
- Finish implementation and provide a report with changed files, tests,
  Vercel resources retained/removed with reasons, migration plan, and unresolved
  blockers. Do not stop after writing an audit with no code changes.
