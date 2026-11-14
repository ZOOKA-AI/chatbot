# Account service and optional tracing release

## Database outage is not a password failure

Both credentials and social login look up the local User record. A failed database
lookup blocks both paths even when OAuth itself succeeds. Account lookups now log
only a fixed operation and validated driver/SQLSTATE code; raw messages, connection
URLs, SQL and email addresses must not be logged. The client receives a generic
account-service-unavailable status instead of a wrong-password hint for known
lookup/create failures. Workspace provisioning can still fail independently and
requires the same database to be healthy.

The application selects DATABASE_URL before POSTGRES_URL. A nonempty but invalid
DATABASE_URL must NOT trigger fallback to a different database: that can split
accounts, balances and tenant data. Confirm the intended database provider,
project, connection method, pooler host and username. Copy its connection string
from the provider rather than constructing a pooler host from the region. A
pooler `tenant/user not found` is not fixed by resetting application passwords.
The owner enters the correct secret directly in Vercel; never send it via chat.
Only then redeploy and test a real authorized login and workspace load.

## Account entry points

Registration now uses the same configured-provider controls as login: Google,
Facebook, Microsoft and phone OTP appear only when their existing server-side
readiness flags permit them. This does not register provider applications, buy
SMS delivery, or certify their OAuth callbacks. Configure and test each provider
separately; no social provider is force-enabled by the UI change.

New Arabic landing pages `/lp/agents` and `/lp/teams` offer clear account and
Studio entry points, with examples labelled as examples rather than executed
results. They do not collect additional user data or promise guaranteed outcomes.

## Migration registration

The existing AgentMessage SQL was absent from the migration journal. Drizzle Kit
generated the new 0026 journal entry/snapshot, and the existing SQL was moved to
that generated migration name without changing its bytes. No production database
was migrated. Existing deployments where the admin endpoint already created the
table still require a reviewed migration plan; IF NOT EXISTS does not certify
schema equivalence. Fresh-install and repeat-run migration tests cover table
creation locally using PGlite, not provider connectivity.

## LangSmith

- Uses pinned langsmith 0.12.0 with existing AI SDK 6; no model/provider changes.
- Only the authenticated chat streaming path is wrapped, not all model calls.
- Off unless LANGSMITH_TRACING=true and a server API key is present.
- LANGSMITH_API_KEY is the preferred secret. Existing misspelling LANGSMITHAPIKEE
  is supported as a compatibility fallback without retrieving/copying its value.
- Set LANGSMITH_AGENT_ID and LANGSMITH_AGENT_ENVIRONMENT to an existing agent and
  its intended environment (production for production; not local by accident).
  Keys linked to multiple workspaces may also need LANGSMITH_WORKSPACE_ID.
- Set LANGSMITH_ENDPOINT only to the trusted endpoint for the account's region.
- Inputs, outputs and metadata are hidden by an explicit Client configuration;
  raw HTTP and response metadata are disabled; error strings are replaced.
  Model/tool names, run relationships, timing and SDK usage/cost fields may still
  be exported. This is not zero telemetry. Review privacy requirements first.
- Next.js after() flushes pending traces after response completion. Flush failures
  are caught with a fixed message. Existing OTel chat spans have input/output
  recording disabled. Other existing OTel instrumentation is not reconfigured.
- This does not create an agent, buy a plan, deploy LangGraph, or confirm account
  API access. A missing/invalid tracing key must not be treated as a login fix.

## Acceptance

First use isolated preview credentials/database and synthetic messages. Validate
successful and failed login, Google callback, account registration and workspace
load. Check trace redaction for tool calls, failures, reasoning and streaming,
and verify the chosen LangSmith environment receives a complete trace. No real
user emails, files, messages or secrets should be used as tracing test fixtures.
Do not claim production acceptance from mocked unit tests or a successful build.
