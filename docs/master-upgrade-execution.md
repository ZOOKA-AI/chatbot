# ZOOKA-AI Master Upgrade — staged implementation report

This is a real, additive implementation slice, **not** a claim that all sixteen
specification sections or a full production SaaS are complete. Production changes,
provider permissions and paid/external writes remain owner-controlled.

## 1. Before development / audit

Baseline: main at f2a6b81. Next.js 16.4.1, React 19, AI SDK 6.0.37,
Auth.js/NextAuth, Drizzle/PostgreSQL, private Blob, existing billing and workspace
roles. Structural inventory covered app routes, shared components/config, database
schema/migration journal, current provider metadata, credential stores, token
refresh, image generation/callback, publishing dispatch/queue, unit/e2e tests and
release docs. This was not an independent exhaustive penetration test or an actual
inspection of all rows/RLS policies in the hosted Supabase account.

Existing features retained: chat and provider routing, login/registration, billing,
HTML Studio/templates/import/export, task board, screen/voice notebooks, private
uploads, owner-only Gateway image pilot, external media worker/callback, Google,
GitHub/Vercel/X/n8n connector paths and legacy Meta/n8n publishing code. Open PRs
#69/#70 address other auth/command work and were not merged or duplicated here.

Earlier runtime evidence showed account DB lookup and pooler routing errors. A
READY deployment and passing local build did not establish that those were fixed.
No production database credential was extracted or replaced for this work.

## 2–4. Creative editor, images and templates

Delivered `/creative`, linked from existing Studio: real SVG layer editor, pointer
move, properties/size/rotation/opacity, stacking, text/rectangle/ellipse/raster,
logo upload, Arabic/English direction, available-device font selection, internal
copy/paste/duplicate, undo/redo, local autosave/restore, editable category templates
with real previews and local favorites, JSON backup/import and actual PNG/SVG
export. Six canvas aspect ratios are available. Brand tokens #2E86AB/#A23B72/
#F8F9FA are scoped to the new surfaces with light/dark mode.

Image form now invokes the existing real engine contract rather than a simulated
success. Added strict settings, six ratios, purpose/style/lighting/palette/camera/
background/lettering/language and optional PNG/JPEG reference. Owner-only, one
output/request, daily three-attempt admission and no retries remain unchanged.
References are bounded and magic-byte checked before admission; model output is
persisted privately before success. The editor imports a compressed preview;
originals stay private. See creative-hub-release.md for privacy and cost caveats.

Limits: the design library is browser-local, unencrypted and not account-bound;
not a cloud-synchronized design database. Thirteen static templates are functional
starting points, not a full commercial asset library. Fonts depend on the device;
no new downloadable font licensing bundle. No animation templates, vector icon
marketplace, masks/background removal, pixel retouching or upscaling engines. Text
and brand consistency in generated images are not guaranteed. `3d-look` is a flat
raster style, not a 3D asset. Multiple variants require separate explicitly approved
requests within the existing cap; no hidden batch spending or model override.

## 5. Video

Existing signed external-worker flow retained. Capability hint distinguishes
configuration from verification. No new text/video/image-animation, timeline,
licensed music, voiceover, subtitles or compositor engine was implemented or
claimed available. A provider contract, async lifecycle, cost budget and licensed
assets are release gates before these features can run.

## 6–7. Social control and content agent

No new social writes or auto-posting were enabled. Existing global-environment
Meta dispatch must not be repurposed as authorization for arbitrary customer
workspaces. A safe multi-tenant publisher needs separate approved app products,
per-workspace accounts/scopes, credential isolation, explicit publishing approvals,
media staging, processing polling, durable scheduler/claim/idempotency semantics
and reconciliation before retries. These are not delivered by displaying a queue.
Existing X tools/approval path and manual agent brief/task board are retained.
No trend scraping, invented performance statistics or autonomous campaign engine.
No self-granting permissions, unofficial login or silent code installation.

## 8–10. Integration Hub, discovery and help

Delivered `/integration-hub` with real configured/stored/tested distinctions,
search/category filters, icons where included in the installed icon library,
auth/scope requirements, official-doc links, existing configure/reconnect/disconnect
entry points and expandable help/examples. Unsupported services are explicit
candidates, not installed connectors. Six protected fixed-URL read probes are
implemented for GitHub, Vercel, X, Drive, Gmail and Calendar. They validate response
shape, discard provider payloads and never publish/send/execute a workflow. Google
probe uses the stored access token without deleting, revoking or refreshing it.

NOT CONFIGURED/CONFIGURED/VERIFIED/ERROR/EXPIRED are derived from actual state.
CONNECTED is reserved but not assigned merely because a key exists. VERIFIED
requires successful read evidence, expires after fifteen minutes and invalidates
on credential/grant changes. Browser also ages out its verification display.
Existing Studio status badges now require that same evidence; old connection
controls describe stored authorization, not fresh health. Admin-only same-origin
POST, workspace-bound SQL, transaction admission at one/minute/provider,
no redirects/arbitrary URLs and safe fixed diagnostics constrain tests.

Discovery is a reviewed evidence catalog, not an autonomous service-search/
connector-generation/install bot. n8n self-hosted probes remain unavailable pending
network/SSRF review; its existing connector is preserved. No universal raw-key form
is invented for services with different credential and authorization contracts.
There is inline help and disclosure, not a complete per-setting interactive
onboarding/help-center product. Generic icons remain for services whose official
marks were not in the installed library; no fake logo assets were scraped.

## 11. Dashboard

Delivered workspace operations panel with bounded date window (1–90 days), actual
MediaJob aggregates/type/status, updated HTML project count, recorded usage-event
rows and recent operations. JSON export includes no prompt, user message or token.
Unavailable database yields explicit error, not fake zero activity. Browser-local
designs are not counted as cloud projects. Cost and storage bytes remain unknown
until a verified ledger exists. No social performance collection, global-user
filter, invoices, token totals or storage estimates are fabricated.

## 12. Database / security

Added IntegrationCheck as a workspace/provider-scoped latest-check record, not a
complete immutable audit history. Generated migration 0027 and snapshot via Drizzle
Kit; SQL creates the table, enables RLS, and revokes anon/authenticated roles where
present. No policy grants browser access. Backend must use a trusted DB role and
validated workspace scope. No existing table/data was deleted or replaced; no
production migration or db:push ran. Do not apply unreviewed generated schema diffs
across custom-managed tables; inspect hosted history/schema first.

Existing upload/private file protections and webhook signatures retained. Imported
designs reject active/remote SVG/image URLs, duplicate ids and out-of-bounds values;
exported text is XML escaped. This does not certify every legacy route, credential
store, rate limiter or publisher against all threats. Existing self-hosted network
paths and global social credential assumptions need further security work.

## 13–14. Design system and autonomous execution

New surfaces use scoped brand tokens, light/dark, mobile layouts, Arabic/English UI
and real controls. Templates are predominantly Arabic content. Existing app theme
and navigation are not globally replaced. No licensed robot illustration was
provided for this task; no asset-ownership or pixel-parity claim is made.
Autonomous task runner/social approvals/campaign scheduling were not implemented
as a new subsystem. Existing chat tool approvals and manual briefs remain; PR #70
is a separate proposal, not a dependency silently merged into this work.

## 15. Tests and evidence

Recorded local unit/embedded PostgreSQL checks cover SVG escaping/import bounds,
valid reference settings, real provider-byte storage via mocked inference/Blob,
wrong-role/unauthorized/CSRF inputs, fixed URL/no redirect probes, response-schema
validation, fresh/stale/rotated verification, workspace-isolated OAuth metadata
and metrics, and fresh/repeated migrations/RLS. Provider calls are intercepted or
mocked: no claim that external accounts were successfully connected in this task.

Browser checks include editing, autosave/reload, local copies/order/undo/redo,
malformed import rejection, SVG/PNG downloads, real pointer movement and PNG magic
bytes, unavailable-generation gating, catalog guest/error behavior, 390/1280px
layouts and existing login/HTML Studio regression flows. A cookie-consent overlay
initially intercepted pointer coordinates; the test now rejects optional cookies
before measuring the drag. Existing Studio test copy expectations were updated to
match baseline source wording, without removing storage/reopen or no-connection
assertions. No disabled/skipped tests or reduced lint rules were introduced.

Local results: 166 unit tests across 38 files plus the existing model test passed.
The full production build (including TypeScript) passed. Eighteen browser
scenarios passed against the built app, including existing login/HTML Studio
regressions and the new editor/Hub paths. One additional anonymous-API scenario
passed separately (JSON 401 without a session and unverified capability hints). New module lint
checks passed; the existing repository-wide lint backlog was not globally fixed.
See PR and delivered report for exact-head preview evidence. A local test
with synthetic data is not a successful production login, hosted DB connection,
real image-generation purchase, external OAuth grant or social publication.

## 16. Deployment, costs, owner actions and remaining decisions

1. Review this draft PR. No automatic merge/production deployment is requested.
2. Confirm intended Supabase connection and successful account/workspace access.
   Enter secrets directly in protected Vercel settings, never chat or client code.
3. Back up/reconcile schema/history, then approve staging migration 0027. No implicit
   DDL is executed on normal Hub requests. Test backend role/RLS on hosted Postgres.
4. Authorize isolated provider test accounts and minimal grants. Existing OAuth
   registrations/callbacks and app reviews remain required; keys alone do not
   grant publishing rights or approved product access.
5. If images are enabled, verify Gateway credits/budgets, private Blob storage,
   admission and one synthetic generation/reference end-to-end. Provider inference,
   reference input, storage, transfer, database/compute, automation workers and
   social API tiers can incur charges. No unsupported fixed prices are quoted.
6. Choose the next provider/product contract, spend caps, async worker and consent
   model before video or social scheduling. Do not use platform-wide keys as
   customer authorization or promise unimplemented capabilities to end users.
7. Decide account-bound cloud design storage/versioning, licensed fonts/assets and
   a staged migration/backfill plan. Browser backups are not encrypted vaults.

Remaining major scope is real implementation work, not just missing API keys:
advanced image editing, video timeline/engines, social account onboarding/publishing/
scheduling, analytics collectors, content/discovery agents and a durable autonomous
runner. Those require explicit provider/product/policy decisions and additional
reviewed stages. The full Master Upgrade is not marked complete by this slice.
