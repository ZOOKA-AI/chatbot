# ZOOKA-AI — Release readiness

Nothing here is a date. Each line is a gate with the evidence that would close it.

## Gate 1 — Security (PR #91)

| Requirement | State |
|---|---|
| Cache headers on all responses | met (verified on the wire) |
| No credential leak in body or logs | met (verified) |
| Restore still works | met (verified round trip) |
| Live preview verification | **open** — needs the Vercel bypass key |
| Owner merge approval | **open** |
| Deploy plan + rollback | ready: `git revert` of one commit, no state to undo |

## Gate 2 — Database

| Requirement | State |
|---|---|
| Isolated dev database | **open** — Supabase quota + token, or a Neon seat |
| 0027 verified on a connected server | **open** — verified on an engine only |
| Rollback script | ready and proven |
| Production untouched | met |

## Gate 3 — Tenant isolation

Data-layer isolation is proven; two live tenants are **open** (depends on Gate 2).

## Gate 4 — Commander

Engine: implemented and tested. HTTP layer and UI: **open**, both depend on Gate 2.
A UI that displays invented task states is explicitly forbidden.

## Gate 5 — Integrations

9 connectors exist on `feat/saas-connectors` (PR #88, merged) behind an audited
executor with usage caps. Verified: the executor refuses an unconnected provider
before any network call, and isolation holds at the call boundary. **Open:** a
real read with a real credential for any of the nine, and live two-tenant proof.

## Gate 6 — Frontend/design

Tokens exist (PR #90, draft) with RTL/LTR, reduced motion and mobile tests.
**Open:** application to any page, and a preview review.

## Gate 7 — Release

Preview smoke tests, production health sweep, owner sign-off. All **open**.

## Honest summary

The platform has a verified security fix waiting on access and approval, a
verified data model waiting on a database, and an engine waiting on a UI. The
dependency that unlocks the most work is the **development database**; the second
is the **preview bypass key**.
