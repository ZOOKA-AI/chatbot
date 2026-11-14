# Next product stage: onboarding, sign-in and private workspace

This document is a proposal, not shipped functionality or a claim of global
availability. Account database connectivity must be restored and verified first.

## Secure sign-in options

Keep existing credentials and configured OAuth providers. Add passkeys or expiring
single-use email links only after enrollment, recovery, origin binding and abuse
limits are designed and tested. Additional provider buttons must stay hidden
until their real credentials and callback configuration are ready.

## Six-digit personal code

A user-chosen six-digit code must not be the only remote account credential or
a database encryption key: it has only one million possibilities. Proposed use:
secondary per-user workspace unlock after normal login, not a replacement for
it. Implement server-side attempt counters and timed lockout, salted slow hashing,
short-lived user/session/workspace-bound unlock grants, re-authentication for
setting/changing/resetting it, CSRF protection, recovery and revocation across
devices. Test brute force and cross-tenant access. Do not ship a UI-only lock.

The owner must decide whether the private library stores personal notes/files or
provider credentials/passwords before implementation. Those have materially
different threat models. Provider keys need tenant-bound authenticated encryption,
server-side key management/rotation, redacted logs, audited access, deletion and
provider validation. A short PIN is not an encryption root.

## Honest activation and landing pages

Use bilingual role/use-case landing pages with a clear product demonstration,
truthful availability labels and one primary call to action. First-run onboarding
should ask for a user goal, show a relevant template and produce a draft the user
can review. Integration connection and outbound sharing are optional and explicit.
No fake popularity metrics, forced referrals, hidden subscriptions or claims that
action succeeded without returned evidence. Measure opt-in activation, retention
and successful outcomes instead of raw registrations.

## Acceptance before launch

Require a healthy account database, tested login/recovery, tenant isolation,
accessible mobile/desktop UI, privacy review and isolated acceptance tests before
calling any vault or account-security feature production-ready.
