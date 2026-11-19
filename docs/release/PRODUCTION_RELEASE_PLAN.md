# Production release plan

Prepared, not executed. Production (`zooka-ai.com`, project `chatbot`) has not been touched by this remediation.

## Preconditions

1. Owner approves the release in writing, naming this commit and this migration set.
2. A backup of production is taken and its restore has been rehearsed into a disposable database.
3. The 18 migrations have been applied to a staging database that is not production, and the application ran
   against it for one full customer journey.
4. `PAID_GENERATION_ENABLED` is false at deploy time regardless of any later decision, so no deploy can spend.
5. The provider credentials decision is recorded: a provider with no credential stays visibly unconfigured.

## Sequence

1. Backup, verified by row counts against the live numbers.
2. Apply migrations through the existing admin migrate route with its token, confirming `failed = {}`.
3. Verify the schema in production: table count, RLS, foreign keys, the spend-approval constraint.
4. Deploy the application. Confirm the deployment reaches READY on the exact commit.
5. Smoke: sign-in, one deterministic local action end to end, the studio pages, the approval screen.
6. Confirm no paid provider is reachable: the gateway must report `credential_missing` where no credential exists.
7. Record the release in the engineering ledger with the commit SHAs.

## What must not happen in the same window

- No provider credential is added in the same change as a schema migration.
- No paid generation is enabled in the same change as a deploy.
- No protected branch is merged by automation; the owner merges.

## Definition of a successful release

A new customer can sign in, create a project, run a deterministic action, receive a real file, download it, and
be refused (with a named reason) for anything that would spend money.
