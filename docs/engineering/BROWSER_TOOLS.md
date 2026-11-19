# Browser tools for the agent

The model can drive a real browser. It is the same browser the customer watches, not a second one:
both operate the `BrowserSession` row, the same URL policy and the same event timeline.

## The seven tools

`lib/ai/tools/browser.ts` exports `createBrowserTools({ organizationId, userId })`:

| Tool | What it does | Approval |
| --- | --- | --- |
| `browserNavigate` | opens a URL in the workspace session | no |
| `browserRead` | returns the page text (optionally one selector) | no |
| `browserScreenshot` | captures the page, stored as evidence | no |
| `browserClick` | clicks an element | **needsApproval** |
| `browserType` | types into a field | **needsApproval** |
| `browserScroll` | scrolls the page | no |
| `browserStatus` | reports engine, session and current URL without opening anything | no |

They are registered in `app/(chat)/api/chat/route.ts` only when `agentAccessAuthorized` passes, so a
workspace without agent entitlement never sees them.

## Why they are not a standalone Playwright block

Two designs were rejected on purpose:

- A module-level browser singleton. On a warm serverless function that single browser, and its
  cookies, would be shared by every tenant that hits the instance. Sessions here are keyed by
  session id **and** checked against the caller's organization; a cross-workspace id is refused with
  `session_owned_by_another_workspace`, and the live test asserts it.
- A tool layer that calls Playwright directly. Every navigation goes through `assessUrl`, which
  blocks loopback, link-local and private ranges before Chromium is asked to open anything. The live
  test asserts a `127.0.0.1` URL is refused before the browser touches it.

## Engine

A deployed function cannot launch Chromium, so `lib/browser/remote.ts` resolves a remote engine:

1. `BROWSER_CDP_URL` - any self-hosted Chromium, Steel or Hyperbrowser DevTools endpoint.
2. `BROWSERLESS_TOKEN` (+ `BROWSERLESS_REGION`, default `production-sfo`) - the stealth endpoint
   `wss://{region}.browserless.io/stealth`, captcha solving on. **This is the production path.**
3. `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` - session created on demand.

With none of them the runtime reports `engine not provisioned` rather than failing silently. Local
launch is the development fallback only.

`playwright-core` is a runtime dependency pinned to the version whose Chromium build is installed.
Adding it unpinned pulled 1.65.1, which expects a browser build that does not exist here, and every
launch died with "Executable doesn't exist".

## Evidence, not base64

A screenshot is written to storage and recorded as evidence; the model receives

```
/api/workspace/browser/sessions/{sessionId}/evidence/{evidenceId}
```

so the transcript stays small and the customer can open the frame the agent actually saw. A base64
blob in a tool result would be re-sent to the model on every later turn.

## Verification

- `tests/unit/browser-tools.test.ts` - session reuse, session creation, refusal while a person holds
  control, evidence URL, status opening nothing.
- `tests/unit/browser-runtime-live.test.ts` - a real Chromium: open, navigate, read, click, scroll,
  screenshot, loopback refusal, and two workspaces kept apart. Skips where no browser is installed
  instead of pretending to pass.
