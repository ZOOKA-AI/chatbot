#!/usr/bin/env bash
# Verifies migration 0041 on an isolated PostgreSQL database built from the repository migrations.
#
# Answers the questions a migration can silently get wrong: are the objects there, is the tenant
# policy real, does another workspace see nothing, and does the rollback leave the schema as it
# was. Runs entirely on a scratch database; it refuses any production-looking host.
set -uo pipefail

DB="${1:-zooka_ws}"
HOST="${PGHOST:-127.0.0.1}"
PORT="${PGPORT:-55432}"
DB_URL="postgres://${PGUSER:-postgres}@${HOST}:${PORT}/${DB}"

case "$DB_URL" in
  *supabase*|*krzfrsaquvmwctsajhlm*|*bylfizytgayoefuyliix*|*zooka-ai.com*)
    echo "REFUSED: refusing to run against anything that looks like production"; exit 2;;
esac

pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "PASS $1 ($3)"; pass=$((pass+1));
  else echo "FAIL $1 expected=$2 actual=$3"; fail=$((fail+1)); fi
}

q() { psql -tAq -d "$DB_URL" -c "$1" 2>&1 | tr -d ' \n'; }

check "AgentProject table exists" "1" "$(q "select count(*) from information_schema.tables where table_schema='public' and table_name='AgentProject'")"
check "AgentTask.projectId added" "1" "$(q "select count(*) from information_schema.columns where table_name='AgentTask' and column_name='projectId'")"
check "AgentSchedule.projectId added" "1" "$(q "select count(*) from information_schema.columns where table_name='AgentSchedule' and column_name='projectId'")"
check "AgentIdentity.projectId added" "1" "$(q "select count(*) from information_schema.columns where table_name='AgentIdentity' and column_name='projectId'")"
check "three FKs point at AgentProject" "3" "$(q "select count(*) from information_schema.table_constraints tc join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name where tc.constraint_type='FOREIGN KEY' and ccu.table_name='AgentProject'")"
check "unique per workspace name" "1" "$(q "select count(*) from pg_indexes where tablename='AgentProject' and indexname='AgentProject_organizationId_name_key'")"
check "RLS enabled" "1" "$(q "select count(*) from pg_class where relname='AgentProject' and relrowsecurity")"
check "tenant policy present" "1" "$(q "select count(*) from pg_policies where tablename='AgentProject' and policyname='AgentProject_tenant_isolation'")"
# One row per privilege, so four means SELECT/INSERT/UPDATE/DELETE are all granted.
check "runtime role holds four privileges on the table" "4" "$(q "select count(*) from information_schema.role_table_grants where table_name='AgentProject' and grantee='zooka_runtime'")"

# Seed one project in each of two workspaces, as the owning role.
psql -q -d "$DB_URL" >/dev/null 2>&1 <<'SQL'
INSERT INTO "AgentProject" ("organizationId","name") VALUES ('org-a','Alpha') ON CONFLICT DO NOTHING;
INSERT INTO "AgentProject" ("organizationId","name") VALUES ('org-b','Beta') ON CONFLICT DO NOTHING;
SQL

# Read as the runtime role inside a transaction, which is how the app binds tenant context.
# \gset stores set_config's echo in a variable so the count is the only thing printed.
tenant_count() {
  psql -tAq -d "$DB_URL" 2>&1 <<SQL | tr -d ' \n'
SET ROLE zooka_runtime;
BEGIN;
SELECT set_config('app.organization_id','$1',true) AS _ctx \gset
SELECT count(*) FROM "AgentProject";
ROLLBACK;
SQL
}

no_context_count() {
  psql -tAq -d "$DB_URL" 2>&1 <<'SQL' | tr -d ' \n'
SET ROLE zooka_runtime;
BEGIN;
SELECT count(*) FROM "AgentProject";
ROLLBACK;
SQL
}

check "workspace A sees only its own project" "1" "$(tenant_count org-a)"
check "workspace B sees only its own project" "1" "$(tenant_count org-b)"
check "no tenant context sees nothing" "0" "$(no_context_count)"

# A read filter is not enough: a write into another workspace must be refused by WITH CHECK.
# stderr goes to a file because a command substitution runs in a subshell, where a variable
# assigned inside would be lost before the assertion could read it.
ERRFILE="$(mktemp)"
cross_write() {
  psql -tAq -d "$DB_URL" 2>"$ERRFILE" >/dev/null <<'SQL'
SET ROLE zooka_runtime;
BEGIN;
SELECT set_config('app.organization_id','org-b',true) AS _ctx \gset
INSERT INTO "AgentProject" ("organizationId","name") VALUES ('org-a','Injected');
ROLLBACK;
SQL
  psql -tAq -d "$DB_URL" -c "select count(*) from \"AgentProject\" where name='Injected'" 2>&1 | tr -d ' \n'
}
check "writing into another workspace leaves no row" "0" "$(cross_write)"
case "$(cat "$ERRFILE")" in
  *"row-level security"*) echo "PASS the write was refused by policy"; pass=$((pass+1));;
  *) echo "FAIL the write was not refused (got: $(head -c 120 "$ERRFILE"))"; fail=$((fail+1));;
esac
rm -f "$ERRFILE"

# Rollback on a scratch copy, so the verification database keeps its schema for the tests.
RBDB="${DB}_rollback"
dropdb --if-exists "$RBDB" >/dev/null 2>&1
createdb -T "$DB" "$RBDB" >/dev/null 2>&1
psql -q -d "postgres://${PGUSER:-postgres}@${HOST}:${PORT}/${RBDB}" -v ON_ERROR_STOP=1 \
  -f lib/db/migrations/pending/0041_workspace_projects.down.sql >/dev/null 2>&1
down_ok=$?
check "rollback applies cleanly" "0" "$down_ok"
check "rollback drops AgentProject" "0" "$(psql -tAq -d "postgres://${PGUSER:-postgres}@${HOST}:${PORT}/${RBDB}" -c "select count(*) from information_schema.tables where table_name='AgentProject'" | tr -d ' \n')"
check "rollback keeps AgentTask rows" "1" "$(psql -tAq -d "postgres://${PGUSER:-postgres}@${HOST}:${PORT}/${RBDB}" -c "select count(*) from information_schema.columns where table_name='AgentTask' and column_name='id'" | tr -d ' \n')"

# Re-applying must restore the same shape, which is what makes the pair safe to retry.
psql -q -d "postgres://${PGUSER:-postgres}@${HOST}:${PORT}/${RBDB}" -v ON_ERROR_STOP=1 \
  -f lib/db/migrations/pending/0041_workspace_projects.sql >/dev/null 2>&1
check "migration re-applies after rollback" "1" "$(psql -tAq -d "postgres://${PGUSER:-postgres}@${HOST}:${PORT}/${RBDB}" -c "select count(*) from information_schema.tables where table_name='AgentProject'" | tr -d ' \n')"
dropdb --if-exists "$RBDB" >/dev/null 2>&1

echo "SUMMARY $pass passed, $fail failed"
[ "$fail" -eq 0 ]
