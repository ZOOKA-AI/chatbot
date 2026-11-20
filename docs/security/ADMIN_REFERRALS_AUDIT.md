# `/admin/referrals` access audit

**Question.** The tenant coverage guard carries an exemption for
`app/admin/referrals/page.tsx` with the reason "owner-gated administration,
intentionally cross-tenant". This audit decides whether that exemption is
correct, or whether the page can be tenant-scoped like `app/(chat)/admin/page.tsx`
was in PR #143.

**Verdict.** Cross-tenant by design. The exemption stays, and it now carries a
tested gate instead of an inline comparison.

## Evidence

| Observation | Source |
|---|---|
| The page reads `affiliate` and `referralEvent` with no organisation predicate | `app/admin/referrals/page.tsx` |
| `getReferralReport()` aggregates every partner code and every referral event | `lib/affiliate.ts` |
| The page also writes: `?add=CODE` inserts or updates an affiliate row | `addAffiliate()` in the same file |
| Its data comes from the raw platform connection `@/lib/db/queries`, not a tenant transaction | imports at the top of the page |
| Authorisation was an email allowlist compared inline, plus `?k=` against `BACKUP_TOKEN` | lines removed in this change |
| `/admin` sits in `PROTECTED_PREFIXES`, so the proxy requires a session but does not check a role | `proxy.ts` |

There is no organisation to scope this report to: an affiliate code belongs to
the platform, not to a workspace, and the funnel counts every tenant's signups.
Scoping it to one organisation would make the report wrong rather than safer.

## What the audit found beyond the exemption question

1. **One credential, two powers.** The query-string gate compares against
   `BACKUP_TOKEN`, the same secret that authorises the production database dump.
   Whoever holds the backup token can also read referral revenue and create or
   modify partner commission rates. Those should not be the same secret.
2. **A mutation over GET.** `?add=CODE&pct=…` writes to `affiliate` from a GET
   navigation. A GET that changes data is reachable by a link, a prefetch, or a
   browser retry, and it is excluded from the usual CSRF reasoning that assumes
   mutations are POST.
3. **Denial answers 200.** A signed-in non-administrator receives the denial
   text with HTTP 200, the same defect class that PR #143 fixed for
   `app/(chat)/admin/page.tsx`. The durable fix is a proxy rule that returns a
   real 403 before rendering, because `cacheComponents` streams the response and
   `forbidden()` thrown late cannot change the status.

Findings 1 and 2 are behaviour changes and belong to their own change with the
owner's approval. Finding 3 needs the proxy, and the proxy is shared by every
route, so it does not belong in an audit branch either.

## What this change does

- Moves the decision into `lib/admin/referrals-access.ts`, a pure function, so it
  can be tested without rendering a server component.
- Keeps the behaviour identical: an administrator session or the backup key still
  opens the report, everything else still sees the denial.
- Adds `tests/unit/admin-referrals-access.test.ts`, which proves a request with no
  session is refused, a signed-in non-administrator is refused, an administrator
  is allowed, the key path works, an empty key never matches, and the page routes
  its decision through the gate rather than an inline comparison. If someone
  reintroduces the inline check, the last assertion fails.
- Leaves the guard exemption in place, with its reason pointing here.
