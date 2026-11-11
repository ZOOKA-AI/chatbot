# Database migrations (zooka-ai.com)

Drizzle migrations for the production Postgres behind zooka-ai.com.

## File-to-journal contract

* Every `NNNN_name.sql` file **must** have exactly one entry in `meta/_journal.json`.
* Every journal entry **must** have a matching `.sql` file. `tests/unit/migration-journal.test.ts`
  fails the build if either side is out of sync, if a tag repeats, if `when` is not strictly
  increasing, or if `idx` has a gap.
* The numeric prefix is a sorting hint only. Drizzle keys migrations on the **tag** and on the
  hash of the file content, so two files may share a prefix (for example `0015_media_job` and
  `0015_password_reset_token`) without conflict. Do not renumber shipped files to tidy them up.

## Adding a migration

1. `pnpm db:generate` after changing `lib/db/schema.ts`.
2. Read the generated SQL. Confirm it only touches new objects or uses `IF NOT EXISTS` guards.
3. Append the new entry to `meta/_journal.json` if the generator did not do it for you.
4. Run `pnpm test:unit` — the journal and pglite tests must stay green.
5. Commit the SQL file and the journal in the same commit.

## Never edit a shipped migration

Once a file has run anywhere, its content is frozen. Editing it changes the hash Drizzle compares
against, so environments that already applied it will try to run it again under a new identity.
Ship a new file instead. Migrations are **forward-only**: write a corrective migration rather
than a down script, because a down script that runs in production is a data-loss risk.

## Do not run `drizzle-kit push` here

`push` diffs the schema straight against the database and applies statements with no journal
record. In this repository it would silently desynchronise production from the migration chain.
Use `pnpm db:migrate` (wrapped by `lib/db/migrate.ts`) or the escape hatch below.

## Production is in a different state, on purpose

Production received `WebhookEvent` and `MediaJob` through
`POST /api/admin/migrate` (guarded by the `MIGRATION_TOKEN` header, exempted from the auth proxy
in `proxy.ts`) while the journal was inconsistent. The tables exist; the history does not fully
describe how they got there.

Consequences to keep in mind:

* `WebhookEvent` in production was created without `payload`, with `externalId` as `text`, and
  with the unique index `WebhookEvent_provider_externalId_idx`. `lib/db/schema.ts` expects
  `payload json`, `externalId varchar(255)`, the unique constraint
  `WebhookEvent_provider_externalId_key`, and the index `WebhookEvent_receivedAt_idx`.
  `0019_webhook_event.sql` closes that gap **additively**: it adds the missing column and index
  and widens nothing destructively. Any query that selects `payload` will fail until it has run.
* `/api/admin/migrate` stays the only sanctioned path for a schema change that has to land
  immediately. It is not a substitute for the journal: add the matching `.sql` file and journal
  entry in the same change so the next environment can be built from scratch.

## Verifying drift

`tests/unit/migration-journal.test.ts` proves the journal and the files agree.
`tests/unit/media-migrations.test.ts` boots an in-memory Postgres (pglite), applies the whole
chain, and re-applies the media and webhook migrations to prove they are re-runnable. It never
touches a real database and needs no credentials.
