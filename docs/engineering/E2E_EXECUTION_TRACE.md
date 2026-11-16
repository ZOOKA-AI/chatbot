# End-to-end execution trace: where the chain currently breaks

The platform's promise is that a sentence becomes real work. This document traces
the chain link by link and says, for each link, whether it exists, is tested, or
is missing. It is deliberately unflattering; a chain is only as strong as the
link nobody wrote.

```
user command → task record → agent assignment → tool invocation
→ result → audit record → user-visible evidence
```

| # | Link | State | Evidence / what is missing |
|---|---|---|---|
| 1 | User command reaches the platform | **Works** | `/api/chat` is session-only, resolved through `getWorkspaceContext` |
| 2 | Command becomes a task record | **Works (new)** | `createExecutionTask` tool: writes a real `AgentTask` row in the caller's tenant via `withCommanderScope`, returns the id and the database's own `pending` status. 6 tests, including that a member cannot queue work |
| 3 | Task is visible to the user | **Works** | Commander history, keyset paging, Load more |
| 4 | Agent assignment | **Partial** | `claimTask` is a conditional UPDATE and is tested for duplicates and cancellation, but **nothing calls it on a schedule**: no worker polls the queue |
| 5 | Tool invocation by that agent | **Missing** | Tools exist as chat tools and as connector calls, but no runtime takes a claimed task and executes it |
| 6 | Result recorded | **Partial** | `reportTask` writes status, result and error, and refuses to complete a rejected or cancelled task. Nothing produces the result yet |
| 7 | Audit record | **Works (new)** | Decision and its audit row commit in one transaction; the unique index on `approvalId` makes duplicates impossible; a failed insert rolls the decision back (tested by occupying the slot first) |
| 8 | Evidence shown to the user | **Partial** | `getExecutionStatus` reports the database's truth and says plainly when something is not completed. There is no result artefact (log, diff, file) attached to a task yet |

## The honest summary

Links 1, 2, 3, 7 are real and tested. Link 4 exists but has no engine turning it.
Links 6 and 8 are half-built. Link 5 does not exist.

So today the platform can **record intent and prove it never fabricated
completion**, but it cannot yet execute a task without a human or an external
runner. That is the single largest gap between this build and the product vision,
and it is an engineering gap, not a credentials gap.

## What is safe to build next, in order

1. **A queue runner**: a worker that claims a pending task by conditional UPDATE,
   runs one allow-listed tool, reports the result, and stops. Testable with the
   database alone, no paid service, no production data.
2. **A result artefact**: the runner writes its output (stdout, diff or file) and
   the task links to it, so "evidence" is a stored object rather than a sentence.
3. **Approval gating inside the runner**, so a gated task that is claimed without
   an approval is refused at execution time, not only at claim time.
4. **Chat wiring for decisions**: letting an owner approve from the conversation,
   with the same domain validation the screen uses.

## What must not be done to close the gap

- Do not let the chat model report completion. It has no tool that can.
- Do not mark a task completed from the interface. Completion comes from a report
  written by whatever ran it.
- Do not add a schedule that claims tasks before a runner exists to honour them.
