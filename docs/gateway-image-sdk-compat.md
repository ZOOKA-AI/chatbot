# Gateway image SDK compatibility repair

The deployed image path used @ai-sdk/gateway 3.0.15. Its image response schema
accepted only warnings of type `other`, and its image doGenerate catch threw the
Promise returned by an async error conversion without awaiting it. Consequently,
a valid HTTP 200 image response with a modern non-other warning failed validation,
and callers caught a Promise (no name/statusCode/cause) rather than an Error.
This explains how the old diagnostics can show provider stage with null status;
it does not prove that the discarded production body contained this warning.

Two local transport-fixture tests reproduce the exact installed SDK behavior:
1. An image response with a valid base64 PNG and an `unsupported` warning must
   survive Gateway parsing and AI SDK image decoding.
2. A failed HTTP response must surface an Error rather than an unresolved Promise.

Both fail on 3.0.15 and pass on 3.0.235, within the existing major version. This
change updates Gateway using pnpm, preserving AI SDK 6 and production model,
authentication, budgets, storage, quotas and all application endpoints. No
response parsing shortcuts or blanket ignore-invalid-warnings patches are added.
No real inference/storage request was sent for these tests. The supplied PNG is
a tiny local fixture, not claimed as generated output.

Read-only Gateway metrics also show three HTTP 200 FLUX requests (two at 01:16 UTC
and one at 01:37 UTC), with one image reported for the 01:37 bucket, while the app
returned 502s. These requests have empty project attribution and internal model
ID `bfl:flux-2-pro-preview`; timing/count alignment is evidence supporting a
response-consumption problem, not definitive project-level request correlation.

After review/merge/deploy, a controlled authenticated owner-session image must
verify real output persistence and display. Current workspace admission cap
remains unchanged; do not erase jobs/reset attempts to hide prior failures.
No claim of complete live resolution until that check. Existing dependency peer
warnings remain separate; this is not a general dependency-security upgrade.
