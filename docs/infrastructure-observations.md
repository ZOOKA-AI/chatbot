# Infrastructure observations — 2026-10-31

No AWS, DNS or production change was made.

- Public domain diagnostic at 19:03 UTC reported `zooka-ai.com` resolves directly
  to Vercel, HTTPS 200, and a Let's Encrypt certificate expiring 2027-01-20.
- Delegated nameservers are Cloudflare (`byron.ns.cloudflare.com`,
  `june.ns.cloudflare.com`), not the Route53 nameservers in the supplied script.
- Project-domain API confirms the apex and www are verified on chatbot; www
  redirects to the apex. `platform.zooka-ai.com` is pending ownership verification.
- The domain registration CLI cannot inspect the external registered domain in
  the session team; project-domain read and public diagnostics provide evidence
  without assuming registrar access.
- Production runtime logs from 18:50–19:04 UTC include three `UNDEFINED_VALUE`
  database errors on GitHub/Vercel integration status GET routes at 18:55 UTC.
  They do not establish the precise root cause and were not fixed speculatively.
  No chat errors matched this narrow window; that does not prove chat is fixed.
- Prior chat message save failures remain unresolved. Serving the homepage with
  HTTPS 200 does not verify chat or provider operations.

## AWS repair prerequisite

AWS CLI/kubectl and an authorized AWS execution context are unavailable in this
session. EKS cluster, ALB controller, ACM certificate and Route53 resources in the
user's scripts are user-reported, not verified. Installing binaries alone would
not grant access. Do not run those scripts blindly or redirect production traffic.
Choose the intended hosting target before making changes; preserve existing DNS
records including mail/subdomains, inspect actual infrastructure and IAM, review
version compatibility and permissions, and verify the destination before any
traffic migration. The preview work does not depend on an AWS migration.
