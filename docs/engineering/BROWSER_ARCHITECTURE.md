# The browser — architecture, requirements, limits

Real Chromium, driven by the customer's agent, inside the customer's workspace. Nothing here
simulates a browser: the acceptance run launched Chromium 134, loaded a page, read its title from the
live DOM, paused, handed control to a person, handed it back and closed it.

## Layers

| Layer | File | What it decides |
|---|---|---|
| What may be reached | `lib/browser/url-policy.ts` | Protocol, credentials in URL, hostname, **resolved address**, deployment markers |
| The browser | `lib/browser/runtime.ts` | One Chromium process per server process, one isolated context per session, step budget, sanitised errors |
| The session | `lib/browser/sessions.ts` | Lifecycle state machine, ownership, expiry, timeline, evidence, `agentMayAct` |
| The agent | `lib/agents/worker-tools/browser-task.ts` | Ordered steps, per-step control check, evidence, refusal of consequential actions |
| The customer | `components/browser-console.tsx` | Arabic-first panel, real frames, timeline, screenshots, controls |
| The API | `app/api/workspace/browser/**` | Server-side authorization for every read and every control |

The row is the authority. Nothing launches until a `BrowserSession` row exists, and every control
action re-reads that row through the caller's workspace.

## Isolation

- **Workspace**: `organizationId` on every table, RLS with a tenant policy, and every query filtered
  by the caller's organization. Another workspace's id answers 404, identical to an id that never
  existed.
- **Project coupling**: `(projectId, organizationId)` foreign key to `AgentProject`, the same
  composite key that couples documents, so a session cannot name one workspace and belong to another.
- **Browser**: a separate Playwright context per session — separate cookies, local storage, cache and
  download directory. Closing the session closes all of it.
- **Owner**: the session records `ownerId`; only that person, or an owner/admin of the workspace, may
  pause, take over, hand back or stop it.
- **Network**: scheme allowlist, refusal of credentials in the URL, refusal of loopback, link-local,
  private, CGNAT and multicast addresses, and the same check applied to **every** address the
  hostname resolves to. Cloud metadata (169.254.169.254) is refused even when hidden behind a public
  name.
- **Secrets**: typed values never reach the timeline (only the selector and the character count), and
  error text is scrubbed of credentials before storage.

## Deployment requirements

1. A host that can run Chromium: at least 1 GB RAM per concurrent session, and a system image with
   the Chromium dependencies (`libnss3`, `libatk`, `libgbm`, `libasound2`). Serverless functions are
   not suitable for a browser that must stay alive while a person watches it.
2. `playwright install chromium` in the image build, or a pinned `PLAYWRIGHT_BROWSERS_PATH`.
3. **Never** set `BROWSER_ALLOW_LOOPBACK` or `BROWSER_LOOPBACK_ACKNOWLEDGED` on a deployment; loopback
   is refused outright when `VERCEL_ENV=production` or `ZOOKA_ENV=production`.
4. `BROWSER_EVIDENCE_DIR` on a persistent volume per workspace, mounted private: screenshots are page
   content and may contain personal data.
5. A process model that keeps one instance per session (session affinity), because the browser lives
   in the process that launched it.

## Estimated infrastructure (nothing purchased)

| Option | Shape | Indicative monthly cost |
|---|---|---|
| Self-hosted Chromium on one VM (2 vCPU, 4 GB) | 3–5 concurrent sessions | $12–$24 |
| Container per session (Fly Machines, Cloud Run) | elastic, idle-to-zero | $0.0000025/s per machine + egress, roughly $5–$15 at light use |
| Managed provider (Browserbase, Steel) | per-session minutes | $0 at free tier, then ~$0.10–$0.50 per session hour |

The local runtime used for this milestone costs nothing and is what the tests ran against.

## What is real, what is not

**Real:** launch, close, navigate, click, type, select, scroll, read, screenshot, timeouts, error
reporting, multi-step runs, pause, take-over, hand-back, stop, expiry and cleanup, timeline, evidence,
tenant isolation, agent execution through the queue and worker.

**Real since Directive #047 continuation:**
- **A person driving the page.** With control taken, a click in the frame is dispatched to the live
  page at the scaled page coordinate, keystrokes go through `keyboard.type`, scrolling and navigation
  go to the same session. Verified by a click that actually navigated the page and by a timeline that
  records `human_click`, `human_type`, `human_scroll`, `human_navigate`.
- **Two actors never share the wheel.** Input is refused with `agent_has_control` while the agent
  holds control, and the agent is refused by `agentMayAct` while a person holds it.
- **Crash detection.** Chromium's own `crash` and `close` events set the session's health, a session
  that claims to be active with no browser is reported as `broken` with the reason, and the panel
  offers recovery instead of showing a still frame.
- **Recovery without duplicate execution.** Recovery claims the transition with a conditional update
  on the expected status before launching, so two retries cannot both open a browser and run the
  customer's steps twice. A failed launch leaves the row `failed` with its reason.
- **Approval checkpoint on a real capability.** A `submit` step (a form submission, the one
  consequential action this runtime can genuinely perform) opens no browser unless an approved
  decision exists for that task; without one it files an approval request and returns
  `approval_required`, and a rejection is a hard refusal. Approve and Reject are in the panel.

**Not built, and not claimed:**
- **Live video.** "Live view" is a real screenshot taken at request time and polled every two seconds,
  not a video stream. A WebSocket screencast would make it continuous.
- **Approval that pauses a running page.** Approval is decided before the browser opens, not while a
  page sits mid-form. A paused-then-resumed live run needs a scheduler-side hold on the step loop.
- **Money, publishing, messaging, deletion.** Still refused outright, because a generic click cannot
  be proven to be any of those; only form submission has an approval path.
- **Key presses other than typing and Enter.** `key` commands are refused as unsupported.
- **CAPTCHA and MFA.** Never bypassed. A page that demands either will simply fail the step.
