# Brand/legal release: GATES GREEN, OWNER APPROVAL STILL PENDING

Owner requested one draft PR and no merge/deployment before approval.

## Arabic legal name (resolved)

`COMPANY_LEGAL_NAME_AR` now holds the exact string copied from RAKEZ Services
Licence 47028807 (licensee and operating name, plus legal form):

    رويال هارون كليننيغ اند دس انفكشين سيرفسز ش.م.ح - ذ.م.م

Keep the licence spelling (`كليننيغ`, `انفكشين`); do not translate or normalise it.

## Build fix applied with the name

The root layout had been converted to a cookie-reading `generateMetadata`, which
Next 16 `cacheComponents` rejects on every page whose body is static
("/_not-found", "/lp/cleaning"). Root metadata is static again and a static
`app/not-found.tsx` was added, so the production build completes.

## Changes prepared

Canonical owner-supplied brand, legal, support, country/address/phone, prices,
listing fields and implemented-connection count in lib/brand.ts. Site config is
now an import/re-export. Personal support emails and fallback admin allowlists
removed; admin access requires configured ADMIN_EMAILS. Shared legal pages and
footer use central identity. Manifest, metadata and selected billing/support
surfaces import canonical fields. Embed script served from a route using the
same config. Legal page consolidation requires owner/legal review before release.

Mail sends the canonical From request field to the existing relay; **relay support
and sender-domain verification have not been tested**. A hardcoded relay credential
fallback found in the public source was removed; owner must rotate the old relay
credential and configure ZOOKA_MAIL_KEY securely. Removal does not revoke exposure.
No real email or Stripe operation was performed.

## Gates and limits

prebuild: placeholder + source brand gate. Source gate catches forbidden identity
strings and duplicate canonical literals. postbuild: restricted-identifier scan
of built JS/HTML/JSON/RSC plus local production-browser checks A–D for both language
cookies. These have not run on a completed production build because the missing
Arabic name intentionally stops prebuild. No bypass was added. Chromium must be
installed in the build environment for the postbuild browser gate. Production
build environment also needs valid nonproduction auth/database configuration for
rendered route checks; never use production mutations for this gate.

Identifier detection covers UAE IBAN/ID patterns and labelled license/TRN/VAT
numbers. It cannot prove that an arbitrary unlabelled number or an image is not a
licence number: owner-provided identifiers and manual asset review are required
for an absolute E claim. No prohibited value is printed in gate diagnostics.

Store-listing fields are a typed local export, **not a submitted/updated store
listing**. Stripe products/invoices/receipts, WhatsApp bot setup, existing sent
emails and published store records require separate external-account changes.
Do not describe them as updated by this source change.

The brand gate is not a complete policy/language validator for every prose string.
Review Arabic/English copy and legal-page revisions with the owner before release.
This branch includes earlier Studio changes from PR 24; GitHub diff against main
may include them until that PR is merged. Do not merge accidentally as a tiny
branding-only change or deploy this draft.

## Commands run

| Command | Result |
| --- | --- |
| `pnpm lint` | Still fails, but with 1063 findings across the repo after restoring the locked ultracite 7.0.11 + patch; this is a pre-existing repo-wide backlog, not a branding-branch regression. |
| `pnpm exec tsc --noEmit --incremental false` | Passed (exit 0). |
| `pnpm test:unit` | Passed: 35 Vitest tests plus model test suite. |
| `pnpm build` | Passes end to end (prebuild gates, Next compilation, all pages prerendered, bundle gate). |
| `pnpm check:brand` | Failed on the missing exact Arabic legal name; no other source-gate diagnostics after migration. |
| `postbuild` bundle + rendered A–D | Both pass in Arabic and English on a completed local production build. |

Remaining: supply verified Arabic name; review identity/translation/legal prose;
fix existing lint tooling; complete production build and rendered/bundle gates;
verify sender relay supports canonical From; separately update external store and
Stripe records with owner authorization. Do not merge or deploy this draft.
