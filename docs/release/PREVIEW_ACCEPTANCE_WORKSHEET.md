# Preview acceptance worksheet — six journeys

Run at **https://chatbot-git-release-rc-1-zooka-ai1.vercel.app** (serves `9b8a9d4`; the
deployment URL for the same commit is `chatbot-5z54h1ki7-zooka-ai1.vercel.app`). Sign in to Vercel
first, or a Protection Bypass makes the URL reachable for tooling.

Automated alternative, once `VERCEL_AUTOMATION_BYPASS` is stored in agent secrets:

```bash
BASE_URL=https://chatbot-git-release-rc-1-zooka-ai1.vercel.app \
VERCEL_AUTOMATION_BYPASS=… JOURNEY_EMAIL=… JOURNEY_PASSWORD=… \
node scripts/acceptance/hosted-journeys.mjs
```

It measures login, session persistence, chat, agent execution and logout through the real
NextAuth endpoints, and reports registration honestly: that page is reachable and renders the
form, but submitting it is a server action, so the browser is the only way to complete it.

| # | Journey | Pass condition | Result |
| --- | --- | --- | --- |
| 1 | Registration | new address registers, lands in workspace, no loop back to `/login` | ☐ |
| 2 | Login | same credentials sign in, workspace loads | ☐ |
| 3 | Session persistence | second tab + 5 minutes + reload: still signed in | ☐ |
| 4 | Chat | message saved, survives reload | ☐ |
| 5 | Agent execution | one authorized tool runs, queued → running → completed, result visible, nothing cross-tenant | ☐ |
| 6 | Logout | `/workspace` redirects to `/login`, session gone after reload | ☐ |

Sign-off: date, commit tested, browser, and any failed journey with its exact message.
