# Growth Analytics Spec — ZOOKA GROWTH COMMAND CENTER

Rule that governs this whole document: **every number displays its source, and a
metric with no connected source displays `NOT CONNECTED`.** No placeholder values,
no estimates dressed as data.

## 1. What is actually connected (verified 2026-11-23)

| Source | Status | Gives us |
| --- | --- | --- |
| Google Search Console (`sc-domain:zooka-ai.com`, `webmasters.readonly`) | **CONNECTED** | queries, pages, countries, devices, clicks, impressions, CTR, position |
| Google Analytics 4, property "Zooka AI" | **CONNECTED** | sessions, landing pages, engagement, country |
| `GET /api/admin/growth` + `lib/growth/funnel.ts` | **CONNECTED** (admin only) | signups by `signupSource`, activation, 7-day retention |
| Application database (`User`, `UsageEvent`, `Subscription`) | **CONNECTED** | registrations, activated users, paid conversions |
| Keyword volume provider | **NOT CONNECTED** | — |
| Paid ads reporting for ZOOKA | **NOT CONNECTED** | Meta Ads token is invalid; Ryze is disabled by owner |
| Newsletter/CRM | **NOT CONNECTED** | — |

## 2. The join we cannot make yet

`User` carries `createdAt`, `signupSource`, `signupMedium`, `signupCampaign`,
`signupReferrer` (migration 0067). It carries **no country column**.

Consequence: we can say "this article produced 4 signups" and we can say "this
article got impressions in Egypt", but we cannot say "this article produced a
signup in Egypt". Any dashboard cell implying that is a lie.

Fix, when it is worth doing: capture country at registration from the request
(`x-vercel-ip-country` header is available on Vercel) into a new nullable column.
Until then the country dimension is reported from GSC only, and signups are
reported without a country.

## 3. Metric definitions (so two people cannot report different numbers)

| Metric | Definition | Source | Status |
| --- | --- | --- | --- |
| Countries covered | countries with ≥1 article targeting them | editorial calendar | CONNECTED |
| Published articles | `BlogPost` where `status='published'` | database | CONNECTED |
| Indexed pages | URLs whose inspection verdict is not "unknown" | GSC URL Inspection | PARTIAL — inspection is per-URL, not a count |
| Impressions | GSC impressions, apex host only | GSC | CONNECTED |
| Clicks | GSC clicks, apex host only | GSC | CONNECTED |
| CTR | clicks ÷ impressions, GSC | GSC | CONNECTED |
| Average position | GSC weighted average | GSC | CONNECTED |
| Registrations | new `User` rows in window | database | CONNECTED |
| Activated users | users with ≥1 `UsageEvent` | `UsageEvent` | CONNECTED |
| Paid conversions | active `Subscription` | database | CONNECTED |
| Top landing pages | GA4 landing page report | GA4 | CONNECTED |
| Top search queries | GSC query report | GSC | CONNECTED |
| Technical SEO errors | crawl failures, 404s in internal links | our own test suite | CONNECTED once the link test ships |

## 4. Host separation (mandatory)

The `sc-domain` property aggregates `zooka-ai.com`, `www.zooka-ai.com`,
`zekr.by.zooka-ai.com`, `quran.zekr.by.zooka-ai.com`, `nargesclean.ae.zooka-ai.com`
and `platform.zooka-ai.com`. In the last 90 days, 33 of 140 clicks came from
subdomains that are not the product.

Every query in the dashboard filters to `host == 'zooka-ai.com'` or reports hosts
separately. Mixing them produces fake growth.

## 5. Command center layout (what each panel says when it has no data)

| Panel | Real source | Empty state |
| --- | --- | --- |
| Countries Coverage | editorial calendar + GSC countries | list countries with zero impressions as `0 impressions` |
| Published Articles | `BlogPost` | `0 published` |
| Indexed Pages | GSC inspection samples | `NOT CONNECTED (per-URL inspection only)` |
| Organic Clicks / Impressions / CTR / Position | GSC | `NO DATA` |
| Registrations | `User.createdAt` | `0 in window` |
| Activated Users | `UsageEvent` | `0` |
| Paid Conversions | `Subscription` | `0` |
| Top Landing Pages | GA4 | `NOT CONNECTED` |
| Top Search Queries | GSC | `NO DATA` |
| Content Opportunities | queries with impressions and position 8-30 | `NO DATA` |
| Technical SEO Errors | link test + 404 monitor | `not run yet` |

"Content opportunities" is the most useful panel and the easiest to fake. Definition:
queries where we have impressions but position > 8, ranked by impressions. That is a
real, actionable list from real data.

## 6. Reporting cadence

- **Daily:** nothing. A site with 5 clicks a day does not deserve a daily report.
- **Weekly:** GSC query delta, new indexed URLs, signups by source.
- **Monthly:** cluster performance, decision to expand or kill a cluster.

## 7. Guardrail

If a metric's source disconnects (token expiry, API change), the panel flips to
`NOT CONNECTED` and the last known value is shown with its timestamp. It never
keeps showing a stale number as if it were current.
