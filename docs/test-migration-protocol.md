# Embedded migration test protocol

The existing media integration test failed before executing callbacks because
PGlite's prepared `query()` rejects a legacy migration chunk containing CREATE
TABLE and CREATE INDEX together (`0016_oauth_connection`, with a similar chunk in
`0017_base44_agent_session`). Production uses postgres-js with prepare:false.
This is a driver/protocol distinction, not proof that a production migration ran
or failed. Changing a shipped SQL file solely to satisfy this test is not safe.

The test-only `migratePglite` adapter retains Drizzle's actual readMigrationFiles
and PgDialect.migrate logic for timestamp selection, transaction handling and
history insertion. It compiles each SQL object with the same dialect, uses
PGlite exec for parameterless SQL chunks and query for parameterized statements.
There is no semicolon splitting, error suppression, file rewriting or migration
skipping. Only the three operations used by PgDialect.migrate are implemented;
the explicit type boundary is not a general PgSession implementation and must
not be reused for application queries. Application data queries still use the
normal PGlite driver in the existing integration test.

Regression tests apply the actual checked-in chain, compare every recorded hash
and timestamp to Drizzle's loaded metadata, re-run and compare unchanged history,
and verify an index from a multi-command chunk exists. A deliberately invalid
multi-command fixture must throw and roll back both its object and history row.
Thus a green test cannot come from silently ignoring SQL errors or dropping the
migration journal. Fixture directories are ephemeral and contain no credentials.

No production runtime, migration SQL, lockfile, dependency, secret or database
was changed. These embedded tests do not certify hosted PostgreSQL networking,
roles, existing production history/schema or concurrent connections. The image
pilot's 502 root cause remains a separate issue: this cleanup does not repair
provider, Blob or credential configuration. No paid inference is run here.
