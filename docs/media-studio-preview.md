# Media brief workspace

`/dashboard/studio` is a public Arabic creative-brief editor. It complements,
not replaces, `/studio` (website builder) and `/workspace/studio` (authenticated
media job submission). The Work sidebar links to the brief editor.

Local save/restore/delete and JSON brief export work without an account.
Saving is explicit, not automatic; drafts stay in this browser until cleared.
Do not save sensitive data on shared browsers. JSON export is a description,
not an image, video, or 3D asset. The editor never submits generation jobs or
charges credits; it links to the separate job submission page.

The existing media job pipeline was added to main during this work. Preserve
its signed dispatch, polling and callback rather than replacing it with an
always-disabled endpoint. This change rejects guest sessions, returns generic
errors for unexpected route failures, and delegates the exact API and callback
paths through the proxy so they authenticate themselves instead of returning
HTML login redirects. The callback still validates its HMAC signature.

No provider credentials, production deployment or database migration are
configured by this PR. The existing pipeline needs MEDIA_ENGINE_WEBHOOK_URL,
MEDIA_ENGINE_WEBHOOK_SECRET and a reviewed MediaJob database migration. Its
0020_media_job.sql is not referenced in the current Drizzle journal; do not
claim production readiness or run migrations blindly. Confirm the migration
history and an isolated staging run before deployment. Actual provider generation,
real signed-in job submission and callback-to-preview rendering remain unverified.
Persistent rate/concurrency limits, replay-safe state transitions and provider
asset validation are further release gates before enabling paid generation.
