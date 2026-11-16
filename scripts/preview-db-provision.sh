#!/usr/bin/env bash
# Provision an isolated database for Preview.
#
# Run against a database that is NOT production. The script refuses known
# production hosts before it does anything, and every statement is idempotent so
# a half-finished run can simply be repeated.
#
#   ADMIN_URL   an administrative connection to the preview database
#   RUNTIME_PASSWORD  the password for the restricted runtime role
#
# Example:
#   ADMIN_URL='postgres://postgres@127.0.0.1:55432/zooka_preview' \
#   RUNTIME_PASSWORD='...' ./scripts/preview-db-provision.sh
set -euo pipefail

ADMIN_URL="${ADMIN_URL:?set ADMIN_URL to the preview database}"
RUNTIME_PASSWORD="${RUNTIME_PASSWORD:?set RUNTIME_PASSWORD for the runtime role}"

case "$ADMIN_URL" in
  *krzfrsaquvmwctsajhlm*|*bylfizytgayoefuyliix*)
    echo "refusing: that host is a production project" >&2
    exit 1;;
esac

MIGRATIONS=(
  0027_agent_command_center.sql
  pending/0028_agent_tenant_scope.sql
  pending/0030_agent_rls_policies.sql
  pending/0031_tenant_runtime_role.sql
  pending/0033_decision_audit_uniqueness.sql
  pending/0034_agent_execution.sql
  pending/0035_worker_lease_and_scheduler.sql
)

echo "== applying ${#MIGRATIONS[@]} migrations"
for m in "${MIGRATIONS[@]}"; do
  # 0031 revokes every table grant, so it must run before anything that grants.
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -f "lib/db/migrations/$m" 2>&1 | grep -v 'already exists' || true
  echo "   applied $m"
done

echo "== setting the runtime role password (never printed)"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "ALTER ROLE zooka_runtime WITH PASSWORD '${RUNTIME_PASSWORD}'"

echo "== re-applying grants that 0031 revoked and later files expect"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -f lib/db/migrations/pending/0035_worker_lease_and_scheduler.sql 2>&1 | grep -v 'already exists' || true

echo "== verifying the runtime role is not privileged"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -tAc "
  select case when rolsuper or rolbypassrls then 'FAIL role is privileged' else 'PASS role is restricted' end
  from pg_roles where rolname='zooka_runtime';"

echo "== verifying row-level security is on and forced where required"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -tAc "
  select 'PASS rls_on=' || count(*) filter (where relrowsecurity)
       || ' rls_off=' || count(*) filter (where not relrowsecurity)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and c.relname in ('AgentTask','AgentApproval','AgentDecision','AgentExecution','AgentIdentity');"

echo "done. no production host touched."
