# SEO Baseline Audit — zooka-ai.com

Measured: 2026-11-23, Asia/Dubai. Every number below comes from a live call
(Search Console API, HTTP fetches, repository reads). Anything not measured is
marked **NOT VERIFIED**. Nothing here is estimated.

## 1. The headline finding

The site is not invisible because of content quality. It is invisible because
Google has never crawled the pages we would compete with.

| URL | URL Inspection verdict | Last crawl |
| --- | --- | --- |
| `https://zooka-ai.com/blog` | URL is unknown to Google | never |
| `https://zooka-ai.com/blog/ai-agent-small-business-gmail-automation` | URL is unknown to Google | never |
| `https://zooka-ai.com/ar` | URL is unknown to Google | never |

An unknown URL has no impressions, no ranking, no clicks. The blog post published
2026-10-31 has **zero impressions in 90 days** — it does not appear in any page
row of Search Console, not even at position 90.

## 2. Discovery chain (root cause)

| Signal | State | Effect |
| --- | --- | --- |
| `sitemap.xml` submitted to GSC | **No.** The only submitted sitemap belongs to `nargesclean.ae.zooka-ai.com` (submitted 2026-02-02, last downloaded 2026-10-13, 2 errors) | Google learns about new URLs only by chance |
| `robots.txt` | Correct: allows `/`, disallows `/api/`, `/workspace`, `/chat/`, declares the sitemap | Not the cause |
| Homepage links to `/blog` | Yes, 2 anchors | Blog is discoverable in principle |
| Homepage links to `/ar` | **Zero anchors** | Arabic homepage is reachable only through an `hreflang` hint, which is a hint, not a link |
| `/ar` links to `/blog` | Yes | Arabic page points at the English blog, not an Arabic one |
| `noindex` | None found on `/`, `/ar`, `/blog`, or the post | Not the cause |

So: two independent defects, both fixable without writing a single article.
`/ar` has no internal links at all, and the sitemap was never submitted.

## 3. Traffic reality (Search Console, `sc-domain:zooka-ai.com`)

**90 days (2026-08-25 → 2026-11-23):** 140 clicks, 755 impressions, 58 URLs with
any data. Only 28 of those days carry data at all (from 2026-10-26), meaning the
property effectively started collecting late October.

**28 days by country:**

| Country | Clicks | Impressions | CTR | Avg position |
| --- | --- | --- | --- | --- |
| UAE (`are`) | 104 | 149 | 69.8% | 2.3 |
| Egypt (`egy`) | 2 | 35 | 5.7% | 8.6 |
| Syria (`syr`) | 2 | 18 | 11.1% | 6.0 |
| Morocco (`mar`) | 1 | 6 | 16.7% | 6.3 |
| Sudan (`sdn`) | 1 | 10 | 10.0% | 8.4 |
| Algeria (`dza`) | 0 | 14 | 0% | 8.9 |
| Bahrain (`bhr`) | 0 | 1 | 0% | 6.0 |
| Saudi Arabia, Qatar, Kuwait, Oman, Jordan, Iraq, Tunisia, Libya, Yemen, Palestine, Lebanon, Mauritania, Somalia, Djibouti, Comoros | 0 | 0 | — | — |

A 69.8% CTR at position 2.3 in the UAE is not performance, it is brand navigation:
people typing the product name. Outside the UAE the site receives **6 clicks in 28
days across the entire Arab world**.

**28 days by query — the complete list, all 12 of them:**

| Query | Clicks | Impressions | Position |
| --- | --- | --- | --- |
| zooka | 4 | 23 | 16.3 |
| زؤخة | 0 | 1 | 1.0 |
| zoka ai | 0 | 1 | 4.0 |
| مكتب النرجس للخدم | 0 | 2 | 5.5 |
| زكاك اصطناعي | 0 | 1 | 9.0 |
| perplexity vs chatgpt | 0 | 1 | 10.0 |
| موقع ذكاء اصطناعي عربي | 0 | 1 | 17.0 |
| الذكاء الاصطناعي الاسلامي | 0 | 1 | 24.0 |
| tilawa | 0 | 1 | 28.0 |
| ذكاء اصطناعي إسلامي | 0 | 2 | 29.0 |
| gooka ai web | 0 | 1 | 39.0 |
| تطبيق فتاة تفعل ما تطلبه منها | 0 | 1 | 39.0 |

Not one commercial query in Arabic. Not one query containing "وكيل", "أتمتة",
"n8n", "واتساب", or any term this strategy targets. We are not ranking badly on
our target keywords; we are absent from them.

## 4. Page-level (90 days)

| Page | Clicks | Impressions |
| --- | --- | --- |
| `https://zooka-ai.com/` | 87 | 181 |
| `https://www.zooka-ai.com/` | 11 | 36 |
| `https://zekr.by.zooka-ai.com/` | 7 | 22 |
| `https://zooka-ai.com/contact` | 7 | 80 |
| `https://zooka-ai.com/explore` | 1 | 53 |
| `https://zooka-ai.com/terms` | 0 | 31 |
| `/blog` and every blog post | **absent** | **absent** |

33 of the 140 clicks land on subdomains (`zekr.by`, `quran.zekr.by`,
`nargesclean.ae`, `platform`), not on the product. The domain-level property
mixes several projects into one report. Any growth dashboard must filter to the
apex host or the numbers will flatter us.

## 5. Technical state (measured per route)

| Route | Status | TTFB-ish total | Notes |
| --- | --- | --- | --- |
| `/` | 200 | 1.42 s | 240 KB HTML, server-rendered |
| `/ar` | 200 | 0.71 s | 67 KB |
| `/blog` | 200 | 1.04 s | 42 KB |
| `/blog/ai-agent-small-business-gmail-automation` | 200 | 1.15 s | 58 KB |
| `/pricing` | 200 | 0.89 s | |
| `/tv` | 200 | 0.95 s | |
| `/compare/chatgpt` | 200 | 0.93 s | |
| `/ar/blog` | **404** | 0.38 s | no Arabic blog exists |
| `/ar/pricing` | **404** | 0.09 s | only `/ar` exists in Arabic |
| `/solutions`, `/ar/solutions` | **404** | 0.09 s | proposed in the brief, not built |
| `/regions`, `/ar/regions` | **404** | 0.09 s | proposed in the brief, not built |

Redirects: `http://www` → 308 → `https://www` → 308 → apex. Correct, single hop
per step, no loop.

## 6. Metadata and structured data

| Page | Canonical | hreflang | JSON-LD |
| --- | --- | --- | --- |
| `/` | correct | `en`, `ar`, `x-default`, reciprocal | `Organization`, `SoftwareApplication` |
| `/ar` | correct | `ar`, `en`, `x-default`, reciprocal | `Organization`, plus one block with **no `@type`** (broken) |
| `/blog` | correct | **none** | `Organization`, `Blog`, `ItemList` |
| blog post | correct | **none** | `Organization`, `BlogPosting`, `BreadcrumbList` |

Blog post schema details: `author` is `{"@type":"Organization","name":"Zooka AI"}`,
and `datePublished` equals `dateModified` (`2026-10-31T18:17:33.594Z`). Google
prefers a named person as author for expertise signals; an organization author
with no author page is the weakest available signal.

## 7. Content system (from the repository)

- Table `BlogPost` with columns `slug, lang ('en'|'ar'), title, excerpt, body,
  keyword, status ('draft'|'published'), author, published_at`.
- Read layer: `lib/blog/store.ts`. Renderer: `lib/blog/markdown.tsx`.
- Routes: `app/blog/page.tsx`, `app/blog/[slug]/page.tsx`, publish API
  `app/api/blog/publish/route.ts`.
- `app/ar/` contains exactly one file: `page.tsx`. There is no Arabic route tree.
- `app/sitemap.ts` hardcodes 18 public paths and appends blog posts at
  `/blog/{slug}`. It emits no `/ar` variants beyond the homepage and no
  language alternates.

**Good news:** the schema already stores `lang`, so Arabic posts need no migration.
**Bad news:** nothing routes by language, so an Arabic post published today would
live at `/blog/{slug}` and compete with the English one.

## 8. Not verified in this audit

| Item | Why |
| --- | --- |
| Core Web Vitals field data | CrUX has no data for a site with 755 impressions; lab data needs a Lighthouse run on the preview branch |
| Keyword search volumes for any Arabic term | No keyword tool connected. Every volume in this project is **NOT VERIFIED** until a real source is attached |
| Indexed page count | GSC coverage report is not exposed by the read-only API; the URL Inspection samples above are the available evidence |
| Registration-to-country attribution | The `User` table has no country or source column, so organic country data cannot be joined to signups |

## 9. Conclusion

The strategy in the brief is sound but it is currently aimed at a site Google does
not know exists. Order of work must be:

1. Make `/ar` linkable and submit the sitemap (hours, no content).
2. Give the blog a language-aware route and `hreflang` (one small PR).
3. Publish the first Arabic articles into a structure Google can crawl.
4. Only then measure, and only then expand to 22 countries.

Publishing 52 articles into the current state would produce 52 unindexed pages.
