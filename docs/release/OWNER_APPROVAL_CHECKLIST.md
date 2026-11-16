# Owner approval checklist

Each line is a decision only the owner can make. Nothing below was pre-approved by earlier directives, and none
of it has been done.

## 1. Provider credentials (blocks all real cloud generation)

- [ ] Provide `RUNCOMFY_API_TOKEN` through the secrets form, or `FAL_KEY`, or both. Do not paste either in chat.
- [ ] Confirm the expected ceiling per job. The gateway refuses a job whose estimated cost is unknown.

## 2. Paid generation

- [ ] Approve setting `PAID_GENERATION_ENABLED=true` for a named environment.
- [ ] Approve one specific job: provider, model, capability, and maximum cost. The approval row is created from
      that decision and is spent once.

## 3. Staging database

- [ ] Choose one: a Neon free project, or a Supabase slot. Either needs a credential entered by you.
- [ ] Confirm staging must never point at `krzfrsaquvmwctsajhlm`.

## 4. Migrations

- [ ] Approve applying the 18 pending pairs to staging.
- [ ] Approve applying them to production, in the release window described in `PRODUCTION_RELEASE_PLAN.md`.
- [ ] Acknowledge the rollback data loss listed in `ROLLBACK_PLAN.md` for five tables.

## 5. Review

- [ ] Provide a working Google AI / Gemini key if you want the independent architecture review. All three keys
      in the workspace are rejected by the provider.
- [ ] Grant v0 access if you want the design work performed rather than specified.

## 6. Merge

- [ ] Merge Draft PR #95 when the above are satisfied. No automation will merge it.

## Facts to hold in mind while deciding

- 935 tests pass twice, types are clean twice, the production build succeeds twice.
- 18/18 migrations apply, roll back and reapply on a disposable database, with the seeded row preserved.
- One real model completion was executed on the free tier and returned `ZOOKA`; no paid inference ran.
- Cloud image and video providers are implemented and unconfigured; they refuse by name rather than failing late.
