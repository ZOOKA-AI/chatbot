# Implementation Roadmap

Sequenced so that each step is verifiable before the next one starts. Owner approval
is required for production deploy and for any merge, per standing rules.

## Phase 0 — Discovery (blocking everything else)

| # | Task | Owner of the task | Verification |
| --- | --- | --- | --- |
| 0.1 | Submit `https://zooka-ai.com/sitemap.xml` in Search Console | **Owner** (our scope is read-only) | Sitemap shows "Success" and a download date |
| 0.2 | Language switcher: link `/` ↔ `/ar` on every public page | Engineering (branch) | Homepage HTML contains an anchor to `/ar` |
| 0.3 | `/ar/blog` and `/ar/blog/{slug}` routes | Engineering (branch) | Both return 200 with Arabic content |
| 0.4 | `hreflang` pairs on blog index and posts | Engineering (branch) | Rendered head contains `en`, `ar`, `x-default` |
| 0.5 | Fix the untyped JSON-LD block on `/ar` | Engineering (branch) | Second block declares `SoftwareApplication` |

Phase 0 output: a preview deployment where URL Inspection eventually reports the
Arabic URLs as known to Google. Nothing is written yet.

## Phase 1 — First twelve articles

Depends on Phase 0 being live in production (owner approval).

| # | Task | Verification |
| --- | --- | --- |
| 1.1 | Approve 12 briefs | Each has query, cluster, CTA |
| 1.2 | Write 8 Arabic + 4 English | `CONTENT-QUALITY-CHECKLIST.md` fully ticked |
| 1.3 | Named reviewer signs off | A real name on every post |
| 1.4 | Publish and request indexing | GSC shows the URLs as known |

## Phase 2 — Measure, then decide

| # | Task | Decision it drives |
| --- | --- | --- |
| 2.1 | Pull GSC 28-day deltas per cluster | Expand or rewrite a cluster |
| 2.2 | Add country at registration (`x-vercel-ip-country`) | Whether country-level funnel reporting is worth it |
| 2.3 | Internal-link test in the suite | Keeps the linking map true automatically |

## Phase 3 — Scale what works

Only clusters with at least one impression get more articles. Country pages only
where local evidence exists. Paid acquisition starts in the UAE and Saudi Arabia,
and only after organic proves the landing pages convert.

## Explicitly out of scope until later

- `/solutions/*` and `/regions/*` trees: nothing to put in them yet.
- French content beyond one test page.
- Any auto-publishing to social channels.
- Any claim about a feature that is not working in production today.

## Definition of done for this programme

Not "52 articles". Done means: Arabic URLs indexed, ten non-brand Arabic queries
receiving impressions, at least one click from a country outside the UAE, and
`signupSource` able to attribute a registration to a specific article.
