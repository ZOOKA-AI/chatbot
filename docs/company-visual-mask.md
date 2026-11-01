# Visual mask update — supersedes prior visible-identity footer requirement

Per the owner's latest request, public legal-page body/identity blocks and shared
footer display company identity/address/country as separated stars. Emails stay
visible. The prior support phone is replaced with the owner-selected UAE number
via a WhatsApp-only link, with a starred label and no tel link. Landing/partner
WhatsApp destinations use the canonical contact export and therefore update too.

This is visual masking, not encryption or erasure. WhatsApp URLs necessarily
reveal their destination, including when copied or clicked. Canonical identity
still exists in encrypted source and generated build data; metadata, external
store records, billing seller/signatures and historical Git are NOT scrubbed by
this change. The encrypted payload's old phone is not rewritten without its
protected key; runtime contact exports override it. Never claim the old value
has been cryptographically erased from that payload/history.

Masking legally required operator information may conflict with disclosure or
payment-provider requirements; owner/legal review is required before production.
The rendered gate's footer requirement now expects the mask plus support email,
and checks legal visible text for unmasked names/address/phone and tel links.
This is not a change to Stripe records or invoice issuer identity.

Checks that need generated identity cannot run locally without BRAND_SEAL_KEY.
No key was pulled or printed. The pure masking tests can run without decryption.
Do not deploy until latest preview and disclosures are reviewed.
