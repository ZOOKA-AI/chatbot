# Provider onboarding requirements

Research date: 2026-10-31. This is an implementation checklist, not evidence that accounts are connected. Do not paste secrets into chat, source control, or the public Studio review. Keep app credentials server-side and workspace authorization encrypted and isolated per tenant. Public documentation cannot issue account credentials or approve apps.

## Priority connectors

| Provider | Requirements / next step | Official source |
| --- | --- | --- |
| WhatsApp | For customer onboarding use Meta Embedded Signup; release requires App Review and Advanced Access to business_management and whatsapp_business_management. Implement business onboarding, phone registration, signed webhooks and messaging operations, with only required messaging permissions. | https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup |
| Instagram | Professional account (business/creator); choose Instagram Login separately from Facebook Login. The official collection lists instagram_business_basic, instagram_business_manage_messages, instagram_business_manage_comments, instagram_business_content_publish. Request only implemented operations. This login setup does not grant ads access. | https://www.postman.com/meta/instagram/folder/23987686-98bfade9-3736-4738-8b4a-f56d6534f6de |
| TikTok | Register app, configure web platform/products, client key/secret and verified URLs. Submit scope explanations and an end-to-end demo video for app review. Content posting and advertising are distinct products; do not conflate them. | https://developers.tiktok.com/doc/getting-started-create-an-app |
| Snapchat | Business organization and OAuth app for Marketing/Public Profile APIs. Public Profile access is allowlist-only; request it through the Snap contact using client ID, never client secret. Snap Kit is a separate integration and not a substitute for Marketing API access. | https://developers.snap.com/marketing-api/Public-Profile-API/GetStarted |
| LinkedIn | OAuth app. Consumer open permissions include profile, email and w_member_social via appropriate products. Most additional permissions/partner programs require approval; do not assume organization management is included. | https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access |
| X | Not verified from a direct official docs.x.com source during this research. Confirm current developer portal access, OAuth/user authorization, scopes and API entitlement before implementing. No connector exists in this revision. | — |
| Gmail | Narrow OAuth scopes, declared consent. gmail.send is sensitive; gmail.readonly is restricted. Restricted scope server-side storage/transmission requires security assessment as documented; verify applicable exceptions and production verification. | https://developers.google.com/workspace/gmail/api/auth/scopes |
| n8n | Instance URL + API key from Settings > n8n API > Create an API key. Public API unavailable during free trial. Non-Enterprise keys have broad account access: prefer a dedicated isolated automation account. Existing authenticated connector is in the app. | https://docs.n8n.io/connect/n8n-api/authentication |
| Make | API token with selected scopes or approved OAuth 2.0 client. Define scenario operations and safe execution approval before enabling write actions. | https://developers.make.com/api-documentation/authentication |
| Zapier | To expose Zooka to Zapier, build authenticated triggers/actions (OAuth preferred); this is not a universal token that connects all Zapier apps. Include an authentication test and explicit user consent. | https://docs.zapier.com/integrations/build/auth |

## Other requested tools

| Tool | Confirmed credential approach | Source |
| --- | --- | --- |
| HubSpot | OAuth for multi-account distribution; static auth for a single authorized account. | https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview |
| Klaviyo | Private keys or OAuth for server APIs; public site IDs cannot grant private API access. OAuth is recommended for partners and required for Marketplace. | https://developers.klaviyo.com/en/docs/authenticate_ |
| Stripe | Restricted server-side API keys; do not reuse the platform's billing key for customers' connected accounts. A multi-merchant design needs separate assessment. | https://docs.stripe.com/api/authentication |
| Canva | OAuth authorization code with PKCE; select the proper API product and its review requirements. | https://www.canva.dev/docs/apps/rest-apis/reference/authentication/ |
| Apify | API token, preferably Authorization bearer header, not URL query. Actor execution needs cost limits and approved data access. | https://docs.apify.com/api/v2 |
| Jotform | Account API > Create New Key. Start with Read Access; Full Access permits modifications/deletions. | https://www.jotform.com/help/253-how-to-create-a-jotform-api-key/ |
| Fireflies | Integrations > Fireflies API. Server-side bearer key. | https://docs.fireflies.ai/fundamentals/authorization |
| Customer.io | Account Settings > API Credentials. New private keys for server/App API use; legacy Track API uses site ID plus key. Do not confuse public keys with private authorization. | https://docs.customer.io/accounts/settings/managing-credentials/ |
| Hume | Server-side X-Hume-Api-Key; temporary access tokens for supported browser voice APIs, issued server-side. | https://dev.hume.ai/docs/introduction/api-key.mdx |
| Supabase | Database access is not social provider authorization. Need project ownership/access, isolated preview database, reviewed schema/RLS/encryption, and least-privilege backend access. No managed storage resource was visible in the scoped Vercel team; a manual connection may exist. | https://vercel.com/marketplace/supabase |

Ahrefs, AWS Knowledge and a personal-browser connector still require product-specific research and implementation. Catalog entries are not working connectors.

## Release gates

1. Owner registers provider apps and supplies nonsecret app identifiers; secrets enter protected server settings, never chat.
2. Implement HTTPS callbacks, state/PKCE where appropriate, role/plan checks, token refresh/revocation and encrypted tenant-scoped storage.
3. Implement minimal read operation and real connection validation; an OAuth login alone is not a functioning tool integration.
4. Add write operations with user approval, audit trails, rate limits and webhook signature verification.
5. Test sandbox accounts, expiry, revocation and cross-tenant isolation; complete provider review before general availability.

No provider registration, paid subscription, business verification, production database change or secret installation was performed in this revision.
