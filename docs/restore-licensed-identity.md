# Restore licensed identity — PR only

Latest owner request supersedes visual masking. Deleted the masking policy,
helper and tests; restored canonical legal identity in public copy and footer.
Contact exports read sealed identity only; display formatting groups the sealed
local number, and telephone/WhatsApp links derive from the canonical E.164 value.
No encrypted payload, key or generated identity was changed. A digest assertion
checks the canonical phone without adding its plaintext to source.

Rendered gate rejects separated-star masks, missing legal identity, noncanonical
phone links/visible phone numbers and validates required legal routes in both
languages. release:check unseals before checks and runs the build with strict
render checking (no browser-absence skip).

Attempted BRAND_RENDER_GATE=strict pnpm release:check: BLOCKED at unseal because
BRAND_SEAL_KEY is absent locally. No substitute key/generated identity was added.
Source diff check passed; no masking exports or obsolete phone literals found
in current tracked app/components/lib/scripts/tests/docs. History is unchanged.
Acceptance build, unit suite and preview verification are NOT claimed passed.
Run strict release:check in the authorized environment containing the secret.
No merge, production deployment or external-provider update authorized/performed.
The production site remains on the previous masked release until separately
approved promotion; this PR update alone does not change the live domain.
