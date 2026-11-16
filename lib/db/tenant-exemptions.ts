/**
 * Route files that reach the database without a tenant scope.
 *
 * Every entry is a deliberate decision, not a to-do. The coverage test
 * (`tests/unit/tenant-coverage.test.ts`) fails when a database-touching route
 * is neither wrapped with `withRequestTenantHandler` nor listed here, and it
 * fails again when an entry here no longer matches a real file.
 */
export const TENANT_EXEMPT_ROUTES: Record<string, string> = {
  "app/api/stripe/webhook/route.ts":
    "Stripe webhook: authenticated by signature; no user session exists",
  "app/api/media-engine/callback/route.ts":
    "Media engine callback: authenticated by HMAC signature",
  "app/api/leads/ingest/route.ts":
    "Public lead capture: no session exists by design, input is schema-validated",
  "app/api/admin/migrate/route.ts":
    "Migration runner: authenticated by x-migration-token, not a session",
  "app/api/agent/route.ts":
    "Agent API: authenticated by AGENT_WEBHOOK_KEY header",
  "app/api/base44/agent/route.ts":
    "Base44 agent bridge: authenticated by shared key",
  "app/api/mcp/route.ts":
    "MCP transport: authenticated by workspace API key",
  "app/api/mcp/keys/route.ts":
    "MCP key management: authenticated by workspace API key",
  "app/api/publish/route.ts":
    "Publish queue for n8n: authenticated by workspace API key, organization derived from the key",
  "app/api/admin/overview/route.ts":
    "Admin console: intentionally cross-tenant, gated by platform admin role",
  "app/api/admin/users/route.ts":
    "Admin console: intentionally cross-tenant, gated by platform admin role",
};
