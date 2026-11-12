import type { PGlite, Results, Transaction } from "@electric-sql/pglite";
import type { SQL } from "drizzle-orm";
import { type MigrationConfig, readMigrationFiles } from "drizzle-orm/migrator";
import { PgDialect } from "drizzle-orm/pg-core";
import type { PgSession } from "drizzle-orm/pg-core/session";

interface MigrationSession {
  execute(statement: SQL): Promise<Results | undefined>;
  all(statement: SQL): Promise<unknown[]>;
  transaction(
    callback: (transaction: MigrationSession) => Promise<void>
  ): Promise<void>;
}

/**
 * Migration-only session for embedded PostgreSQL. Production uses postgres-js
 * with prepare:false; PGlite's prepared query() cannot execute legacy SQL chunks
 * containing multiple statements. Use simple-protocol exec() for parameterless
 * migration SQL, not string splitting or exception suppression. Drizzle still
 * controls journal selection, hashes, transaction and history insertion.
 * This does not certify the production driver's network behavior.
 */
export async function migratePglite(client: PGlite, config: MigrationConfig) {
  const dialect = new PgDialect();
  function session(connection: PGlite | Transaction): MigrationSession {
    return {
      async execute(statement: SQL) {
        const query = dialect.sqlToQuery(statement);
        if (query.params.length) {
          return connection.query(query.sql, query.params);
        }
        const results = await connection.exec(query.sql);
        return results.at(-1);
      },
      async all(statement: SQL) {
        const query = dialect.sqlToQuery(statement);
        return (await connection.query(query.sql, query.params)).rows;
      },
      async transaction(
        callback: (transaction: MigrationSession) => Promise<void>
      ) {
        return client.transaction((transaction) =>
          callback(session(transaction))
        );
      },
    };
  }
  // PgDialect.migrate uses only these three session operations. No production
  // session or global query method is patched; this adapter is test-only.
  await dialect.migrate(
    readMigrationFiles(config),
    session(client) as unknown as PgSession,
    config
  );
}
