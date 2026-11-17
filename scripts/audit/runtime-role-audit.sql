-- ============================================================================
-- ZOOKA-AI production runtime-role audit (READ ONLY)
-- ----------------------------------------------------------------------------
-- Answers, in one paste, the questions the cutover decision depends on:
--   * who the application actually connects as right now
--   * whether the runtime role exists and what attributes it carries
--   * which tables carry row level security, and which carry a policy
--   * which tables the runtime role can read/write, and which it cannot
--
-- It contains no DDL, no GRANT, no ALTER and no writes. It is safe to run on
-- production at any time, and it returns counts and names only: no row data,
-- no token, no password, no business figure.
--
-- Run it in the Supabase SQL editor (or psql) against the production database
-- and paste the result back. Section F is the summary to read first.
-- ============================================================================

-- A. Roles and their attributes -------------------------------------------
SELECT rolname,
       rolcanlogin   AS can_login,
       rolsuper      AS is_superuser,
       rolbypassrls  AS bypasses_rls,
       rolcreatedb   AS can_create_db,
       rolcreaterole AS can_create_role,
       rolconnlimit  AS conn_limit
FROM pg_roles
WHERE rolname IN ('postgres', 'zooka_runtime', 'authenticator',
                  'service_role', 'anon', 'authenticated')
ORDER BY rolname;

-- B. Who is connected to this database right now --------------------------
SELECT usename AS role, state, count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY usename, state
ORDER BY connections DESC;

-- C. Runtime role memberships (must be empty for least privilege) ---------
SELECT r.rolname AS member_of
FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.roleid
JOIN pg_roles u ON u.oid = m.member
WHERE u.rolname = 'zooka_runtime';

-- D. Per-table security posture ------------------------------------------
SELECT c.relname                         AS table_name,
       c.relrowsecurity                  AS rls_enabled,
       c.relforcerowsecurity             AS rls_forced,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
       has_table_privilege('zooka_runtime', c.oid, 'SELECT') AS rt_select,
       has_table_privilege('zooka_runtime', c.oid, 'INSERT') AS rt_insert,
       has_table_privilege('zooka_runtime', c.oid, 'UPDATE') AS rt_update,
       has_table_privilege('zooka_runtime', c.oid, 'DELETE') AS rt_delete,
       pg_get_userbyid(c.relowner)       AS table_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- E. Schema-level privileges that must stay closed ------------------------
SELECT 'schema public: CREATE for zooka_runtime' AS check_name,
       has_schema_privilege('zooka_runtime', 'public', 'CREATE') AS is_granted
UNION ALL
SELECT 'schema public: USAGE for zooka_runtime',
       has_schema_privilege('zooka_runtime', 'public', 'USAGE');

-- F. Summary -------------------------------------------------------------
WITH t AS (
  SELECT c.oid,
         c.relname,
         c.relrowsecurity,
         has_table_privilege('zooka_runtime', c.oid, 'SELECT') AS rt_select,
         EXISTS (
           SELECT 1 FROM information_schema.columns col
           WHERE col.table_schema = 'public'
             AND col.table_name = c.relname
             AND col.column_name = 'organizationId'
         ) AS has_tenant_column
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
)
SELECT count(*) FILTER (WHERE true)                              AS public_tables,
       count(*) FILTER (WHERE relrowsecurity)                    AS rls_enabled,
       count(*) FILTER (WHERE NOT relrowsecurity)                AS rls_disabled,
       count(*) FILTER (WHERE NOT rt_select)                     AS runtime_without_select,
       count(*) FILTER (WHERE NOT relrowsecurity AND has_tenant_column)
                                                                 AS rls_disabled_with_tenant_column,
       count(*) FILTER (WHERE NOT relrowsecurity AND NOT has_tenant_column)
                                                                 AS rls_disabled_without_tenant_column
FROM t;
