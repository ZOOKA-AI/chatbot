# Plans and monthly quotas

The workspace subscription is stored in `Subscription`; usage is stored in
`UsageEvent`. Both are scoped to `organizationId`. Do not create user-level
quota records or read usage without the active workspace scope.

| Plan | Messages/month | Agent runs/month | Web searches/month |
| --- | ---: | ---: | ---: |
| Free | 1,000 | 0 | 0 |
| Pro | 10,000 | 500 | 1,000 |
| Business | 100,000 | 5,000 | 10,000 |

`lib/saas/quota.ts` is the server-side policy. Check a quota before starting a
paid operation and record usage only after that operation succeeds. Quota
counts reset at the beginning of each UTC calendar month. Inactive and
past-due subscriptions use Free limits.

The monthly caps complement, and do not replace, IP/hourly rate limits.
