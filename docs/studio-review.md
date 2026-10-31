# Zooka Studio review

Open `/studio`. This public, noindex review surface is separate from the current
chat experience. It never loads account details, tokens, or tenant data.

## Working in this revision

- Responsive Arabic dark workspace, navigation, action sheet and details panel.
- Routes for projects, templates, code/preview, integrations, browser and profile.
- Three HTML/CSS starter sites; editable code, isolated preview, mobile width,
  clipboard copy, HTML download, local project persistence/open/delete/search.
- Searchable, categorized integration catalog. Existing connection controls remain
  in authenticated `/settings/integrations`; role and plan checks are unchanged.
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
