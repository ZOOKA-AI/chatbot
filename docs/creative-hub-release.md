# Creative Studio and Integration Hub — release boundary

## Scope and architecture

This is an additive, reviewable development slice, not delivery of every item in
the Master Upgrade specification. The existing Next.js/AI SDK/Auth.js/PostgreSQL
application, auth system, HTML Studio, media callback, billing and social dispatch
are retained. No production migration, provider account action, paid inference,
message or social publication was performed by this work.

The new public `/creative` route is a real local SVG design editor, not a picture
of an editor. It offers text/raster/rectangle/ellipse layers, pointer dragging,
numeric size/rotation/opacity, color/font/direction settings, stacking, internal
copy/paste and duplicate, undo/redo (20 states), local autosave (12 designs / 4 MB),
JSON import/export, SVG/PNG rendering/export, and template previews/favorites.
Thirteen original editable category templates use text/shapes, not fake generated
artwork. Uploaded logos/images must be raster PNG/JPEG/WebP under 1 MB. SVG/remote
image sources are rejected in imported design documents; exported text is XML
escaped. These controls are not an encrypted vault or account-specific cloud
storage. Local designs/favorites are shared by browser profile; avoid shared
devices and export important work. Arabic fonts are selected from fonts installed
on the device, not a licensed downloadable font library. PNG export may differ
when the named font is absent. No icon marketplace or animated-template renderer
is implemented. Reference-image prompts and complex masks are distinct features.

## Image generation

`/creative` now calls the existing `/api/media-engine` gateway image pilot using
explicit user cost/data consent. The server still requires a regular workspace
owner, private Blob, working account database, and the existing daily three-attempt
admission transaction before provider spending. A failed admission spends nothing;
a failed admitted generation still counts as an attempt. No automatic retries or
increase in daily quota. One image per request, using the same bfl/flux-2-pro model.
The API accepts strict bounded imageOptions for six aspect ratios, design purpose,
style/palette/lighting/camera/background/lettering/language, and optional PNG/JPEG
base64 reference. It validates size/signature before admission. No remote URL is
accepted for references, avoiding server-side arbitrary URL fetching. A reference
leaves the app only on the explicit generate action. The SDK uses prompt.images
and aspectRatio. Preferences and text fidelity are not guarantees; 3d-look is a
flat raster, not a 3D scene. Original assets remain private and workspace-scoped.
The editor can import a compressed local preview without making the original public.

The legacy external-worker request contract is unchanged: advanced image settings
are rejected for that backend rather than silently ignored. Video/3D generation,
background removal, masks, upscaling, licensed music/voiceover, timelines and
subtitles require an appropriate provider/worker contract; they are not claimed
as supported by the image engine. The public capability endpoint reports only
configuration hints and verified:false. It never triggers an inference.

## Integration Hub

The new `/integration-hub` catalog covers existing connectors and requested
candidates. Unknown/unimplemented services are guidance, not working connectors.
GET `/api/integration-hub` requires a regular workspace session and reads its own
credential metadata and persisted tests; database/migration failures return 503,
not zero accounts or fake disconnection. No plaintext token is returned. Platform
billing/model/database keys are NOT reinterpreted as a user's personal integration.

POST requires regular owner/admin, same-origin Origin and strict provider-only
input. Organization identity always comes from validated session context. Only
six allowlisted read probes exist: GitHub identity, Vercel user, X identity,
Drive minimal list, Gmail profile and Calendar minimal events list. No provider
writes, posting, code execution, dynamic URL, arbitrary-host token forwarding or
redirect following. Bodies are schema-checked; 200 with the wrong shape is not
VERIFIED. Returned errors are fixed codes, never raw account/provider messages.
The check timeout is 8 seconds. One attempt per workspace/provider/minute is
reserved transactionally before the outbound request; failed/in-progress checks
cannot leave an old green badge. Provider account metadata is discarded by probes.
Probes use the stored Google access token without refreshing, revoking or deleting
credentials. Expired tokens need the existing authorized refresh/reconnect flow.
The stable Google connection id binds the test to a grant, and a new OAuth
connection invalidates old verification.

`IntegrationCheck` stores only latest status/code/time and a credential-version
fingerprint, scoped by organization/provider. VERIFIED expires after 15 minutes
or credential change; CONFIGURED includes settings/stored credentials without
fresh read evidence. CONNECTED is reserved by the shared state type, not assigned
from a key merely existing. ERROR/EXPIRED are explicit failures. Old Studio status
badges now consume the same recent-probe evidence. Saved Google authorization can
still be disconnected/re-authorized using the existing controls; it is no longer
labelled as proof of live service health. A green read test is not proof of write
permissions, token refresh forever, provider review, quota or publishing ability.

n8n's existing connector remains usable. This Hub deliberately does NOT probe an
arbitrary self-hosted n8n URL until DNS/private-network/redirect SSRF handling is
reviewed. Existing code outside this change has separate network policies and
must be audited before broad rollout. No new free-form secret store or generic
"paste any provider key" form was added; unsupported credential contracts must be
designed per provider. No auto-installing integration discovery/code executor.

## Database and metrics

Migration 0027 creates IntegrationCheck with organization FK/composite PK, enables
RLS, and revokes public-client roles where present. There is no client policy:
backend requests must use the existing trusted DB role and enforce validated
workspace scope. Read-only application users must never receive the backend role.
Review schema/history/backups before migration; a missing migration returns a
clear service error and neutral/unverified old badges, not an implicit CREATE.
The custom migration/snapshot was generated with Drizzle Kit; do not apply an
unreviewed `db:push` across existing custom-managed tables. This is a latest-check
record, not a complete immutable audit/event history.

GET `/api/creative/overview` reads bounded 1–90 day workspace aggregates from
MediaJob, StudioProject and UsageEvent. It returns actual grouped counts/recent
operations only; absent DB returns 503 and the UI displays unavailable. It does
not count browser-local designs as cloud projects. JSON export contains no prompt,
file content or tokens. Cost/storage bytes remain null until a verified ledger
exists; counts of usage-event rows are not provider-token counts or invoices.
No cross-user/admin-wide reporting or social performance scraping is implemented.

## Social, automation and discovery boundary

Existing X tools and legacy Meta dispatch are retained, not silently replaced.
The legacy dispatch uses platform environment credentials and is not safe to
repurpose as multi-customer publishing authorization. No new post/schedule/autopost
button is connected to those global credentials. Social OAuth product approval,
per-workspace credentials/account validation, media staging, idempotent job claims,
provider processing/polling, revocation, explicit consent scopes and failed/unknown
outcome reconciliation are prerequisites for the requested Social Control Center.
A queued row alone is not a scheduler or successful post. PR #70 is a separate
command-layer proposal; its existence is not proof of a safe autonomous publisher.
A reviewed evidence catalog is not an autonomous discovery bot or connector factory.

## Deployment/acceptance gates

- Confirm correct production Supabase connection and successful account login.
  Earlier production pooler routing failures are not solved by this UI work.
- Review/apply migration 0027 on isolated staging with a backend role; test RLS,
  permissions, rate admission/concurrency and tenant isolation on hosted Postgres.
- Test each real connector with consented staging accounts. Tests in this change
  do not certify actual OAuth grants, external provider access or account approval.
- Keep image generation off until owner approval, private storage and spend limits
  are verified. Test one synthetic image/reference; inspect bytes, asset access,
  saved job state and actual provider cost. Never retry uncertain jobs blindly.
- Review the local-storage and model-provider privacy notices and font rights.
- Merge/release only with separate owner approval; this work opens a PR/preview.

See the accompanying execution report for exact test results and remaining scope.
