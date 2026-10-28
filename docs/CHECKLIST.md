# Preview release checklist

Complete on the Vercel Preview URL before approving a production deployment.

- [ ] Send a normal Arabic chat message and confirm a complete response.
- [ ] Interrupt a response; verify completed text remains, an Arabic error toast
  appears, the composer unlocks, and Retry completes the response.
- [ ] Confirm Free-plan chat, agent, model, and search limits are enforced by the
  server; confirm Pro and Business limits and monthly usage display.
- [ ] With `TAVILY_API_KEY` configured, use web search and verify source links;
  verify the search quota blocks a request at its limit.
- [ ] Verify `checkout.session.completed`, `invoice.paid`,
  `invoice.payment_failed`, subscription update, and subscription deletion with
  Stripe test-mode events and a valid webhook signature.
- [ ] Check all legal and partner pages in Arabic and English on desktop and
  mobile; confirm contact placeholders are filled before launch.
- [ ] Verify analytics consent choices: optional analytics loads only after
  acceptance and stays disabled after rejection.
- [ ] Test account deletion with a standalone account; confirm active
  subscriptions and workspaces with other members are blocked safely.
- [ ] Verify the partner application opens the configured email client and does
  not claim that the request was sent automatically.
- [ ] Review Sentry events and confirm request data, headers, user identity,
  breadcrumbs, and exception messages are sanitized.
- [ ] Complete security, legal, billing, and privacy review; verify there are no
  unexpected secrets or tenant-isolation regressions.

Google Drive OAuth, Notion/Shopify connectors, n8n actions, and Site Builder are
not enabled by this release and require separate security-reviewed work before
being offered to customers.
