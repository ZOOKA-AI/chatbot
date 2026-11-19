# Execution worker

The first component that runs work rather than describing it. One task in, one
tool call, one recorded attempt, one honest status.

## States

| State | Meaning | Who sets it |
|---|---|---|
| `pending` | Queued, not taken | `createTask` |
| `in_progress` | Claimed by an agent, tool running | `claimTask` (conditional UPDATE on `pending`) |
| `blocked` | Not runnable: retry ceiling reached, or waiting on a decision | worker, on refusal |
| `completed` | A tool returned a result and it was stored | worker, only after `ok: true` |
| `failed` | The tool errored, timed out, or returned nothing usable | worker |
| `cancelled` | The owner cancelled, before or during execution | `cancelTask`; wins over any result |

The attempt itself has its own states in `AgentExecution`: `running`,
`succeeded`, `failed`, `timed_out`, `cancelled`, `rejected`.

## Order of operations, and why

1. **Tool lookup first.** An unknown tool, or one without `readOnly`, is refused
   before the task is claimed. A wrong configuration must not take work.
2. **Tenant check.** `getTask` returns `null` for another organisation's task, so
   the caller cannot tell "not yours" from "does not exist".
3. **Attempt count.** Counted before claiming so the ceiling is honest.
4. **Claim.** A conditional UPDATE on `status = 'pending'`; approval-gated tasks
   are refused here unless their own organisation approved them.
5. **Open the attempt.** A partial unique index, `(taskId) where status='running'`,
   makes a second in-flight attempt impossible at the database level.
6. **Run with a timeout.** Each tool declares `timeoutMs`; the signal is aborted
   and the attempt recorded as `timed_out`.
7. **Re-read the task.** If it was cancelled while the tool worked, the cancel
   wins: the attempt is recorded as `cancelled` and nothing is reported complete.
8. **Report.** Completion is written only when the tool returned `ok: true`.
   Anything else is `failed`, with the tool's error stored verbatim.

## Least privilege

The worker runs inside the tenant transaction on `zooka_runtime`: no superuser, no
`BYPASSRLS`, no `CREATE`, and on `AgentExecution` it holds `SELECT, INSERT, UPDATE`
and is explicitly denied `DELETE`. An execution record that can be erased is not
an audit trail, and the test suite asserts the denial.

## The one tool

`github_repo_inspect`: four GETs against `api.github.com`. It refuses any
repository outside `WORKER_GITHUB_ALLOWED_REPOS` before making a request, reads
metadata and up to five files, and returns a structured report. It cannot create
branches, push, open pull requests, or write anything.

The credential is read from `WORKER_GITHUB_TOKEN` (falling back to
`GITHUB_ACCESS_TOKEN`), used to build a header, and never stored. Every string
that leaves the tool passes through `redact`, so a token that appears inside a
file preview cannot reach the database; a test feeds a leaking file and asserts
the stored evidence contains `[redacted]` and not the token.

**Credential defect found:** the value of `GITHUB_ACCESS_TOKEN` in
`/app/.agents/.env` is stored as `$'gho_...'` (ANSI-C quoting), so the literal
`$'` reached the header and every request answered 401. Reading 40 characters
from offset 3 works. This is the same defect class that broke `N8N_MCP_TOKEN`.
Production must hold the bare value, and `WORKER_GITHUB_TOKEN` is preferred so a
quoted value in the shared file cannot take the worker down again.

## Running it

`POST /api/agents/worker` with an agent key. Body:
`{ "tool": "github_repo_inspect", "payload": { "repo": "owner/name", "paths": ["package.json"] } }`.
Omitting `taskId` takes the oldest `pending` task in the caller's own workspace
and returns `queue_empty` when there is none. `maxDuration = 60`.

## What this does not do

No scheduler calls it yet: nothing enqueues and runs on a timer. It runs one task
per request. Tool coverage is one read-only tool. Non-GitHub work still needs a
tool written for it.
