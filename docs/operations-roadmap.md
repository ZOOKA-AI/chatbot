# Command Center and operating-system roadmap

## Implemented stage

`/command-center` is a bilingual public help/command shell, not public operational
access. `/api/operations` requires a regular user with owner/admin membership in
the validated active workspace, never a body-supplied organization. POST requires
same Origin and accepts only an exact allowlisted command with no extra fields.

Four commands execute read-only evidence collection: /status, /report, /cost and
/integrations. They reuse workspace billing and Integration Hub metadata reads;
there is no new model call, provider probe, Git operation, shell, deployment or
payment. Database/compute cost is not free or known; actual provider cost remains
null. A plan name/usage counter is not proof of settlement or an invoice.

Reports contain timestamps, source availability, what was done/working/broken,
three rule-derived priorities, approval gates and explicit unknown infrastructure
fields. They never infer build/log/test success from a page loading. Read failures
produce PARTIAL/null evidence, not fake healthy status or zero metrics. No raw
error message, provider identity, scope bundle, token or connection URL is included.
A report is only as current as its timestamp and the freshness of provider metadata.

The existing AgentMessage table stores sanitized report JSON under a separate
operations:user-id conversation lane and organization id. GET returns at most ten
records scoped to both. This is not tamper-proof immutable audit logging, global
platform memory, or a record of rejected attempts. If persistence fails, the API
returns recorded:false and REPORT_NOT_PERSISTED, not false assurance. Existing
migration/DB acceptance remains required; no new duplicate report table is created.

No daily scheduler is enabled. The Daily Development Intelligence panel creates
an on-demand dated report only. It does not read Git/Vercel platform logs, collect
provider analytics or monitor incidents in the background. No recurring budget,
cron or worker was activated. There is no promise of unattended future action.

All eighteen requested slash commands have visible descriptions. /creative and
/image open the existing tool without submitting any paid request. Other commands
are explicitly NOT_IMPLEMENTED, disabled in UI and refused server-side with 422
and executed:false. They are not a free-form shell or SQL gateway. Rollback is not
performed from this interface; target validation/backup and owner approval remain
required. PR #70's separate command executor is not silently merged or duplicated.

The eleven named agent roles are governance definitions only, labelled DESIGN
ONLY / NOT RUNNING. No model, worker, tool credential, permission or budget is
self-issued. Their descriptions are not independent runtime agents. Executable
roles require explicit least-privilege tool contracts, isolation, cost reservation,
versioned run records, timeout/retry/idempotency rules and real tests first.

## Priorities and gates

1. **Reliable identity/data foundation**: privately verify the intended Supabase
   connection, account login/workspace access, backups, actual RLS/backend role
   and registered migrations. Do not blindly fall back to another database or
   change authentication. Record hosted acceptance separately from local tests.
2. **Evidence-based operations**: deploy the reviewed command/read/report slice
   only after database acceptance. Add isolated Vercel/GitHub read integrations
   with documented permissions, sanitization, source timestamps, retention and
   failure modes. No dashboard-generated API token is copied from agent tooling.
3. **Durable task runner**: define task types and allowed transitions for
   INSPECT→PLAN→IMPLEMENT→TEST→REVIEW→APPROVE→DEPLOY→VERIFY. Persist the approved
   target, source SHA and exact input digest; approvals cannot be client booleans.
   Require spend reservation and idempotent claims before paid/external work.
4. **Provider router**: retain current model routing. Add versioned capabilities,
   freshness-aware provider health, per-task budget policy and a run event for any
   fallback. No unrecorded substitution or invented model availability/prices.
5. **Business contract**: reuse existing User/Organization/Subscription/UsageEvent
   and wallet records; do not add duplicate entities or offer ENTERPRISE billing
   without a real contract. Versioned admin-limit overrides need RBAC, audit and
   server enforcement across every entry path, not an editable UI label only.
6. **Creative/social**: accept the existing staged editor/Hub first. Add per-tenant
   approved social accounts, media staging, durable schedule/claims, outcome
   reconciliation and explicit publish authorization before autonomous posting.
   Video engine, licensed assets and privacy/provider contracts remain required.
7. **Daily automation**: only after durable read jobs and owner-approved cadence,
   retention, notification destination and spend limits exist, enable scheduling.
   A daily report must show source coverage gaps and unknowns, not fabricate data.

## Acceptance and release

Local route tests mock evidence sources and verify RBAC/CSRF, input rejection,
workspace/user history scope, unsupported-command refusal, partial reports,
identity/error redaction and persistence failure. Browser tests with labelled
synthetic fixtures test rendering/export; actual guest API tests verify denial.
These do not prove hosted database health, authenticated admin workflows or
real integration-account access. No production change or merge is performed by
this implementation. Existing draft PR #72 includes the staged dependencies;
owner review and hosted acceptance are still needed before release.
