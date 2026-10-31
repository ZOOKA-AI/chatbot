# Zooka Studio review

Open `/studio`. This public, noindex review surface is separate from the current
chat experience. It never loads account details, tokens, or tenant data.

## Working in this revision

- Responsive Arabic dark workspace, navigation, action sheet and details panel.
- Routes for projects, tasks, templates, local playground, code/preview, integrations, browser and profile.
- Six HTML/CSS starter sites; editable code, isolated preview, mobile width,
  clipboard copy, HTML download, local project persistence/open/delete/search.
- Local manual task board with priority, target date, status, search, deletion and Markdown export (no execution/reminders).
- Bounded HTML import and versioned JSON backup/restore; restore validates all records and creates new IDs without overwriting. Files stay on the browser.
- Local two-player tic-tac-toe, five-question educational quiz, and sequential prewritten creative challenges. No external streaming or fabricated live channels.
- Interactive native HTML disclosure templates for quiz/event/menu, without scripts.
- Searchable, categorized integration catalog. Existing connection controls remain
  in authenticated `/settings/integrations`; role and plan checks are unchanged.
- Native provider-guide dialogs show researched prerequisites and official source links where documented; no token form or fake connection state.
- Profile links open existing account/workspace/billing pages, not mock accounts.

Projects are **browser-local**, not encrypted or synced. Do not store secrets or
sensitive data in project HTML. Export a backup before clearing browser storage.
The preview uses an empty sandbox allowlist plus a restrictive CSP: scripts,
forms, network resources and popups are disabled. It is not a remote browser.

## Not implemented or verified as working

- Remote browser sessions: needs a session-isolated execution service, streaming,
  safe network access, consent boundaries, usage limits and audit trail.
- Social connectors (WhatsApp, Instagram, Snapchat, TikTok, LinkedIn, X), Make
  and Zapier: no working connector is provided. Provider applications, consent,
  API permissions and server-side implementations are needed. Tokens alone do
  not implement operations. The catalog explicitly marks these inactive.
- Cloud project sync, automatic site generation/deployment, profile editing.
- Production chat database save failure: runtime evidence says message saving
  failed, but the logs do not expose the underlying database error. This revision
  deliberately does not guess at or bypass database consistency or migrations.

No production migration, provider app registration, secrets change or production
promotion is part of this review. Before making this the default application,
resolve the above prerequisites and review auth, tenancy and execution boundaries.

## Review checklist

Check `/studio` at desktop and mobile sizes; open the create sheet; navigate all
sections. Open a template, edit HTML, update preview, save and reopen the project.
Search/filter integration cards and open an inactive provider's requirements.
Existing account and real connection flows require a signed-in account and, for
some actions, an eligible plan/admin role; the public preview cannot validate them.

## Verification for the expanded revision

25 unit tests plus model suite and seven Playwright scenarios pass locally. The
scenarios exercise edit/save/reopen, provider requirements, mobile action sheet,
task state persistence/move/delete, HTML import and JSON backup/restore with fresh
IDs and invalid-file rejection, actual quiz/game logic, and native disclosure
interaction in the sandboxed template. TypeScript passes.

Date and tasks are local organization aids only, not scheduled jobs. Games and
quiz results reset on page reload. Imported HTML may contain arbitrary content:
the existing iframe sandbox/CSP remains unchanged. Downloaded HTML is not
sanitized; review it before opening outside the sandbox or publishing. Backups
are unencrypted and browser storage may be cleared. No files reach Zooka servers.

## Unified public and internal navigation

The visitor home now uses the green/gold `PlatformSite` instead of the previous
marketing surface. Signed-in users still land in their existing chat; `/explore`
is the public product entry for everyone. `/platform-readiness` is a dated
functional-readiness guide, not live monitoring. Header, workspace navigation,
Studio return links and footer connect these surfaces to real templates/tasks,
integration guides, existing authentication/account/workspace/billing and legal
routes. Existing pricing and auth operations are not reimplemented.

The user-supplied design was used for visual direction only. No quantum
encryption, absolute safety, religious endorsement, accuracy percentages,
financial wallet, satellite network or native app availability was claimed.
This UI revision does not repair database-save or connection-status errors and
it never migrates DNS or promotes production. Real connector/backend execution
and account-specific checks remain prerequisites before release.

Unified-navigation verification: 27 unit tests plus the model suite pass, as do
seven Studio scenarios and three public-platform scenarios (Arabic root-to-Studio
return path, mobile FAQ/links/layout, English cookie/readiness). The first
concurrent root dev compilation exceeded a 60-second test budget; the three
platform scenarios then passed in 55.3 seconds with one worker and a 120-second
budget. This is a local development observation, not a production latency claim.
