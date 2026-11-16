# ZOOKA-AI — Database status

## Production

One Supabase project, PostgreSQL 17, ~40 tables and 12 views, RLS enabled on all
40 with `anon`/`authenticated` revoked (applied earlier through the app's own
migration route and verified from `information_schema.role_table_grants` = 0
rows). Row-level facts as of the last sweep: 275 users, 42 chats, 211 messages,
0 `AgentMessage` before the agent-message fix.

Reachability from this sandbox: **no direct connection** (only 443 is open), so
all reads and checks go through the application's admin routes.

## Migration 0027 (agent command center)

Five tables: `AgentIdentity`, `AgentTask`, `AgentDecision`, `AgentApproval`,
`AgentDeployment`, with six foreign keys, their indexes and RLS.

| Check | Result |
|---|---|
| Applies to an empty schema | VERIFIED on PGlite |
| Foreign keys present and enforced | VERIFIED |
| RLS refuses a non-owner role | VERIFIED |
| Cross-tenant read refused | VERIFIED |
| Rollback restores the exact previous table set | VERIFIED (`rollback/0027_..._down.sql`) |
| Rollback is a no-op where 0027 never ran | VERIFIED |
| Applied to production | **NOT**, and forbidden without approval |
| Applied to a connected dev server | **BLOCKED** (no dev database) |

PGlite is a real PostgreSQL engine compiled to WebAssembly, so the SQL semantics
above are genuine. It is **not** a Supabase server: it cannot prove connection
pooling, the Supabase auth roles, or migration behaviour under the dashboard. That
distinction is the reason Stage 3 exists.

## Test fixtures

Synthetic only. No production row, email or hash is used in any test; the restore
test hashes its own password and writes it into a throwaway database.
