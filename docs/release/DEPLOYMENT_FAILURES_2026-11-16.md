# Failed deployments, 16 November 2026: what actually failed

Evidence: Vercel commit statuses read through the GitHub API for each SHA (the `Vercel – chatbot`
context), then each failure reproduced locally in a clean `git worktree` with
`pnpm install --frozen-lockfile` and `pnpm run build`. The build log is quoted where it is the
first fatal error.

| Commit | Branch | Vercel | First fatal error |
| --- | --- | --- | --- |
| `b89b322` | feat/uae-billing | failed | `lib/billing/guard.ts(57,5): error TS2322` — `balanceMinor` typed `number \| undefined` |
| `b4994fd` | feat/commander-tenant-scope | failed | `Error: Route "/admin": Next.js encountered uncached or runtime data during prerendering` → `Export encountered an error on /(chat)/admin/page` |
| `9c9fdb2` | feat/commander-tenant-scope | failed | same class: pages that read tenant scope were prerendered at build time |
| `160807e` | feat/commander-tenant-scope | failed | same class; the commit itself only changed a test, so the tree still lacked the build fix |
| `4d811f4` | feat/commander-tenant-scope | **success** | — |
| `7365e9c` | release/rc-1 | **success** | — |

## b89b322: application code, not configuration

A real type error, and my mistake: I committed and pushed the billing branch without ever running
`tsc` on it. The type check I ran afterwards was on `release/rc-1`, which does not contain those
files, so it was green and meaningless.

`getSubscriptionStatus` returns either an account with a numeric balance or the
`no_billing_account` case. The disabled-enforcement branch read `balanceMinor` through an `in`
check that TypeScript still widened to `number | undefined`.

Fixed at the call site and at the cause: `getSubscriptionStatus` now declares
`SubscriptionStatus` explicitly, and the guard narrows with a `typeof` check so an account that
does not exist can never be described to a caller as a zero wallet. `tsc --noEmit` is 0, the
production build exits 0, and the 18 ledger tests still pass. Landed as `e36858e`.

Distinguishing the categories the owner asked about: this one is **application code**. Nothing was
missing from the environment, no dependency was wrong, and no Vercel setting was involved; the
same failure happens on a laptop.

## b4994fd / 9c9fdb2 / 160807e: application code meeting platform configuration

`cacheComponents` is enabled, so Next.js refuses to prerender a page that reads request-time data.
The tenant-scope work made pages read the session and the database, so `/admin` and the other
`(chat)` pages became unprerenderable while still being treated as static.

The branch carries three attempts at this: `9c9fdb2` marked the pages `dynamic`, `b4994fd` used
`connection()`, and both were reverted by `c04f6df` because they changed runtime behaviour. The fix
that stands is `4d811f4`: `tenantScopeEnabled()` returns `false` during
`NEXT_PHASE === "phase-production-build"`, so the build behaves exactly like the flag-off case,
while every real request still enforces the tenant context. Vercel confirms success on that commit,
and a local clean build of `4d811f4` was reproduced here: build exit 0, `tsc` exit 0.

So: **application code**, triggered by a **platform configuration choice** (`cacheComponents`), not
a Vercel misconfiguration and not a missing variable.

## What this does not touch

`release/rc-1` at `7365e9c` deployed successfully and its build, `tsc`, and two regression runs are
green. Neither defect exists on it: the credit ledger is not on `rc-1` at all (`lib/billing/ledger.ts`,
`guard.ts`, `payments.ts` and migration `0050` exist only on `feat/uae-billing`), and the
tenant-scope prerender defect was resolved before the branch was folded into the candidate.

## Lesson recorded

A green `tsc` on one branch says nothing about another. Every branch that will be pushed gets its
own `tsc` and build, in its own worktree, before the push.
