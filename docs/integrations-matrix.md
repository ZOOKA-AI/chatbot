# Integration capability matrix — SaaS release

Generated from code on 2026-11-16 (`lib/integrations/connectors/matrix.ts` renders the same table at runtime through the `listConnectorMatrix` agent tool). A row can only be `yes` where the code that satisfies it exists.

**Verification columns are deliberately `no`.** They record a live provider proof, and a live proof requires a tenant credential for that provider. Nothing in this release pretends an unperformed verification happened; `testConnectorConnection` fills those columns per workspace once a credential is connected.

| Provider | Docs | Implemented | Auth verified | Reads verified | Writes verified | Agent tools | Isolation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| instagram | yes | yes | no | no | no | yes | yes |
| meta | yes | yes | no | no | no | yes | yes |
| linkedin | yes | yes | no | no | no | yes | yes |
| snapchat | yes | yes | no | no | no | yes | yes |
| telegram_ads | yes | yes | no | no | no | yes | yes |
| telegram_bot | yes | yes | no | no | no | yes | yes |
| improvmx | yes | yes | no | no | no | yes | yes |
| google_ads | yes | yes | no | no | no | yes | yes |
| slack | yes | yes | no | no | no | yes | yes |
| notion | yes | yes | no | no | no | yes | yes |
| twilio | yes | yes | no | no | no | yes | yes |
| shopify | yes | yes | no | no | no | yes | yes |
| tiktok | yes | yes | no | no | no | yes | yes |
| whatsapp | yes | yes | no | no | no | yes | yes |
| x | yes | yes | no | no | no | yes | yes |
| cloudflare | yes | yes | no | no | no | yes | yes |
| namecheap | yes | yes | no | no | no | yes | yes |
| gmail | yes | yes | no | no | no | yes | yes |
| google_drive | yes | yes | no | no | no | yes | yes |
| google_calendar | yes | yes | no | no | no | yes | yes |
| github | yes | yes | no | no | no | yes | yes |
| vercel | yes | yes | no | no | no | yes | yes |
| supabase | yes | yes | no | no | no | yes | yes |
| n8n | yes | yes | no | no | no | yes | yes |
| stripe | yes | no | no | no | no | no | no |
| google_maps | yes | no | no | no | no | no | no |

Totals: 26 providers, 26 documented, 24 implemented, 24 tenant-isolated, 9 carrying a stated blocker, 2 not implemented (Stripe, Google Maps platform key).

## Read operations shipped in this release

| Provider | Read operations |
| --- | --- |
| slack | `list_channels`, `team_info` |
| notion | `search` |
| twilio | `list_numbers` |
| shopify | `list_products`, `count_orders` |
| tiktok | `profile` |
| whatsapp | `phone_number`, `list_templates` |
| x | `me`, `recent_posts` |
| cloudflare | `list_zones` |
| namecheap | `list_domains` (blocked by IP allowlist) |

## What is enforced for every connector call

- **Credential storage**: `integration_connection`, per `workspace_id`, AES-256-GCM envelope (`v1.nonce.tag.ciphertext`), key from `TOKEN_ENCRYPTION_KEY`.
- **Tenant isolation**: the executor can only read a credential by passing the calling workspace id; there is no provider-wide or platform-token path.
- **Audit**: every read appends `integration_audit` (`read:<op>`, `read_failed:<op>`, `verified`, `connected`, `disconnected`) with status only, never the credential.
- **Usage**: `usage_counter` increments `connector_read_<provider>`; the cap is 2000 reads per month per workspace, after which the call returns `usage_limit` instead of spending.
- **Approvals**: no write operation exists in any of the nine connectors. `writeStatus` states, per provider, why (publishing, sending, DNS, spending). The agent cannot publish, send or spend.
- **Disconnect**: `disconnectIntegration` sets `status=revoked`, clears the ciphertext and writes an audit row.

## Blockers that need the provider's own portal

| Provider | Blocker |
| --- | --- |
| slack | Tenant must create and install a Slack app to mint the bot token (or a platform OAuth app for one-click). |
| notion | Tenant must create an integration and share pages with it (or a public Notion OAuth app for one-click). |
| twilio | Verified sender and A2P registration for SMS; reads work with SID + token alone. |
| shopify | Custom app installed in the tenant store; or a public Shopify app for OAuth. |
| tiktok | `user.info.basic` scope granted, redirect URI registered on this domain, review for any posting. |
| whatsapp | Approved WhatsApp Business Account with a verified number assigned to the token's app. |
| x | Platform `X_CLIENT_ID`/`X_CLIENT_SECRET` for one-click OAuth; a tenant user token works without them. |
| cloudflare | Tenant API token with Zone:Read (or a Cloudflare OAuth client for one-click). |
| namecheap | Egress IP must be allowlisted by Namecheap (error 1011100 otherwise). |

## Expected running cost

No new paid dependency is required by this release. Incremental cost is the existing Vercel/Supabase usage plus provider calls: all nine connectors use free-tier read endpoints (Slack, Notion, Twilio read, Shopify Admin read, TikTok display, WhatsApp Cloud, X v2 reads, Cloudflare, Namecheap). The only metered item introduced is the usage counter, which is a database row per read.
