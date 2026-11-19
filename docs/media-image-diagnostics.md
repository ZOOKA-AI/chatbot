# Image failure diagnostics

Production request evidence after activating the image pilot showed two POST
/api/media-engine 502 responses at 2026-11-12 01:16:26 and 01:16:41 UTC. Runtime
logs for those requests were empty because the shared catch returned a generic
response without logging. A separate 422 is expected for unsupported media.

This change closes that diagnostic blind spot; it does NOT claim to fix an
unidentified external provider or storage configuration problem.

Generation, image output validation, Blob upload and database persistence are
identified separately. Errors log a random reference, a fixed stage name and a
numeric upstream HTTP status when exposed directly by the SDK. No raw error
message/body/header, credential, prompt, URL or customer/job identifier is logged.
The same reference is returned to the caller and stored in failed-job text where
possible. A secondary database failure must not erase the first-stage reference.
Nested SDK errors may not expose a top-level status: null means unknown, not 200.

After deployment, retry one controlled image from the owner's session and report
the reference. Correlate the safe event with Gateway/Blob provider telemetry
before changing credentials, switching model or resetting limits. Retries can
spend again and count toward the three-attempt UTC workspace cap. Do not loop
requests or erase quota/job records to hide failures. The original two 502s
cannot be assigned to a provider/storage root cause retroactively from empty logs.

No production credentials, quotas or jobs were changed by this source change.
Tests simulate faults and verify stage labeling, reference correlation and
secret redaction. They are not live application inference tests.
