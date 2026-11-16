# Commander browser acceptance procedure

Status: prepared, not executed. The preview requires Vercel authentication and no
authorised session is available to the agent, and bypassing that protection is
forbidden by the standing directive. This document is what makes the test
repeatable the moment a session exists.

## What "authorised" means here

Only three routes are acceptable, in order of preference:

1. A person who is already a member of the Vercel team `zooka-ai1` opens the
   preview URL in their own browser and performs the steps below while recording
   the screen.
2. The owner issues a Vercel protection-bypass token and stores it as the agent
   secret `VERCEL_AUTOMATION_BYPASS`. The agent then uses it as a header. This is
   an owner action, never a request made in chat.
3. The preview is temporarily promoted to a branch alias the owner is signed in
   to. Reversible, and the owner's decision.

Never: guessing a session cookie, reusing a production cookie on the preview
domain, or turning deployment protection off to make a test pass.

## Prerequisites

- The account performing the test holds `owner` or `admin` in the workspace
  (members can view but cannot decide approvals; the test needs both).
- A second workspace exists, owned by a different account, to prove isolation.
- The preview's own `AUTH_SECRET` is set, so the session is valid on that domain.

## Steps, and what each one proves

| # | Action | Expected, observable evidence |
|---|---|---|
| 1 | Sign in on the preview domain | Land on `/workspace/commander`, not a redirect loop |
| 2 | Create a task with a clear instruction | New row at the top of history; note the task id |
| 3 | Cancel it from the detail panel | Status becomes `cancelled`; the same id shows the new status after reload |
| 4 | Create a task with "requires approval" | It appears in Approvals and does **not** appear as claimable |
| 5 | Reject it with a reason of three characters | The interface refuses; the approval stays pending |
| 6 | Reject it with a real reason | Status `rejected`; the reason appears in the task's history panel |
| 7 | Approval with no reason | Succeeds: a yes needs no excuse |
| 8 | Press "Load more" | Older rows append, no duplicate rows, count rises; on the last page the control is replaced by an end-of-history line |
| 9 | Switch language | Every string changes, direction flips to RTL in Arabic, no clipped control |
| 10 | Narrow the viewport to 375 px | Table scrolls inside its container; the page body does not scroll sideways |
| 11 | Sign in as the second workspace | None of workspace A's tasks or approvals are visible, by id or by list |
| 12 | As a member, open the approvals screen | Decisions are not offered; a crafted POST returns 403 |

## Evidence to capture per step

Screenshot with the status visible, the task id, and the row in the database
(`select id, status, reportedAt from "AgentTask" where id = '...'`) from a
read-only session. A screenshot alone is not evidence of a database change; a
database row alone is not evidence the interface shows it.

## Failure handling

Any step that fails is recorded as failed with its screenshot, not retried
silently. Steps 1, 11 and 12 are security-relevant: a failure there blocks
release regardless of the rest.

## What this procedure cannot cover

It cannot prove that an agent executes a task, because no execution worker exists
yet. See `E2E_EXECUTION_TRACE.md`.
