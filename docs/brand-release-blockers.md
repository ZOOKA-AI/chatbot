# Brand/legal release: NOT APPROVED FOR PRODUCTION

Owner requested one draft PR and no merge/deployment before approval.

## Blocking input

`COMPANY_LEGAL_NAME_AR` is deliberately null. The previous Arabic string was not
verified against the trade licence. The owner must supply the exact legal name;
never translate the English name or publish the instruction placeholder. The
source prebuild gate fails on this input. English fallback in local legal-page
review is not certification that the Arabic requirement is satisfied.

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
| `pnpm lint` | Failed: existing patched Ultracite/Biome config contains unsupported `useTailwindSortedClasses`. Configuration not weakened. |
| `pnpm exec tsc --noEmit --incremental false` | Passed (exit 0). |
| `pnpm test:unit` | Passed: 35 Vitest tests plus model test suite. |
| `pnpm build` | Failed in prebuild by design: exact Arabic legal name missing. Next production compilation did not run. |
| `pnpm check:brand` | Failed on the missing exact Arabic legal name; no other source-gate diagnostics after migration. |
| `postbuild` rendered A–D / bundle E | Not reached; no completed production artifact. No claim that these tests passed. |

Remaining: supply verified Arabic name; review identity/translation/legal prose;
fix existing lint tooling; complete production build and rendered/bundle gates;
verify sender relay supports canonical From; separately update external store and
Stripe records with owner authorization. Do not merge or deploy this draft.
