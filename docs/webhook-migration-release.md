# Webhook migration release gate

## Why the migration keeps its original name

Drizzle loads SQL files from `lib/db/migrations/meta/_journal.json`, not by
scanning numbered SQL files. Commit `ef57b1d` renamed the generated
`0014_brief_sauron.sql` to `0019_webhook_event.sql` without updating the journal.
This prevented the migrator from loading the migration files at all.

Restore the original filename and SQL bytes from `80b877a`. Keep the journal's
existing timestamp and the SQL hash unchanged so databases that already recorded
this migration are not made to replay it. Do not add a second journal entry for
the same SQL or register the standalone `0014_n8n_connection` through
`0018_studio_project` files blindly: the generated migration already includes
those tables as well as `WebhookEvent`.

## Before a production migration

1. Run `pnpm exec vitest run tests/unit/migrations.test.ts`. This exercises
   Drizzle's actual file loader without connecting to any database.
2. Confirm a current database backup and the intended database identity.
   `lib/db/migrate.ts` selects `DATABASE_URL` first, then `POSTGRES_URL`, and
   loads `.env.local`. Neither the domain name nor a successful Vercel build
   identifies the database that a local migration command will modify.
3. On an isolated staging database with a representative schema and migration
   history, run `pnpm db:migrate` and inspect the resulting tables and indexes.
   Check both a new database and any existing manually provisioned tables:
   `CREATE TABLE IF NOT EXISTS` does not reconcile an incompatible table.
4. Inspect production's `drizzle.__drizzle_migrations` history before approving
   the production run. If it diverges from the repository, investigate rather
   than deleting history or modifying previously applied SQL.
5. After explicit approval, run `pnpm db:migrate` from the reviewed checkout
   in a trusted environment that already has the target database credentials.
   Do not paste credentials into chat or commit environment files.
6. Verify that `WebhookEvent` exists, has the unique constraint on
   `(provider, externalId)` and its `receivedAt` index, then send a controlled
   duplicate webhook delivery and confirm only one row is stored.

This change repairs migration discovery only. It does not apply a production
migration, populate Vercel secrets, or prove end-to-end webhook delivery. The
current event-claim code allows processing to continue on a storage error;
restoring migration discovery alone does not guarantee exactly-once processing.
