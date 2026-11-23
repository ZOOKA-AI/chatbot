# Technical SEO Plan — from "unknown to Google" to crawlable Arabic coverage

Ordered by impact per hour of work. Every item names the file that changes.

## P0 — Discovery (do before writing any article)

### P0.1 Submit the sitemap for the apex domain
- Owner action in Search Console: add `https://zooka-ai.com/sitemap.xml` under the
  `sc-domain:zooka-ai.com` property. Currently the only submitted sitemap belongs
  to `nargesclean.ae.zooka-ai.com` and carries 2 errors.
- Our connector scope is `webmasters.readonly`, so we cannot submit it. This is
  the single highest-value five-minute action in the whole plan.

### P0.2 Link `/ar` from the site chrome
- Evidence: the homepage contains **0** anchors to `/ar`. Only `hreflang` points
  there, and Google has never crawled it.
- Change: a language switcher in the shared header/footer, rendered on every
  public page, pointing at the correct counterpart of the current path.
- Files: the layout/header component used by `app/(marketing)` or the root layout.

### P0.3 Make the blog route language-aware
- Today an Arabic post would land at `/blog/{slug}` and compete with the English
  post for the same URL space.
- Target shape, keeping every existing English URL intact:
  - `/blog` → English index (unchanged)
  - `/blog/{slug}` → English post (unchanged)
  - `/ar/blog` → Arabic index
  - `/ar/blog/{slug}` → Arabic post
- Implementation: a new route `app/ar/blog/page.tsx` and `app/ar/blog/[slug]/page.tsx`
  that call `listPublishedPosts` / `getPublishedPost` and filter `lang === 'ar'`.
  `lib/blog/store.ts` already returns `lang`, so no schema change is needed.

### P0.4 Emit hreflang pairs on blog pages
- Evidence: `/blog` and the post have canonical but **no** `alternates.languages`.
- Change in `app/blog/[slug]/page.tsx` `generateMetadata`: look up the counterpart
  post in the other language by shared topic key, and emit `en`, `ar`,
  `x-default`. When no counterpart exists, emit only `x-default` at the canonical
  language URL. Never emit an `hreflang` pointing at a 404.

### P0.5 Fix the broken JSON-LD block on `/ar`
- Evidence: `/ar` emits two JSON-LD blocks; the second has no `@type`.
- Change: correct the object so it declares `SoftwareApplication`, matching `/`.

## P1 — Structured data and author signals

### P1.1 Person author, not organization
- Evidence: `BlogPosting.author` is `{"@type":"Organization","name":"Zooka AI"}`.
- Change: require a named human reviewer on every post (`author` column already
  exists) and emit `Person` with `url` to an author page. **Do not invent a name.**
  Until the owner confirms who reviews, keep the organization author and mark the
  post `draft`.

### P1.2 Article completeness
- Add to `BlogPosting`: `inLanguage`, `wordCount`, `articleSection`, `keywords`,
  and a real `dateModified` that changes on edit.

### P1.3 FAQ and HowTo
- Add `FAQPage` only where the page genuinely contains the questions. No hidden
  FAQ blocks added for schema alone.

## P2 — Sitemap and indexing hygiene

- `app/sitemap.ts`: emit per-language entries and `alternates.languages` for every
  paired URL. Include `/ar/blog` and each Arabic post.
- Keep `listPublishedPosts` resilient (already wrapped in try/catch) so a database
  hiccup never empties the sitemap.
- Add `<lastmod>` only when it reflects a real content change.

## P3 — Reporting hygiene

- The `sc-domain` property mixes `zekr.by`, `quran.zekr.by`, `nargesclean.ae` and
  `platform` into one report; 33 of 140 clicks in 90 days are subdomains.
- Every growth number must be filtered to the apex host, or reported separately per
  host. Otherwise the dashboard will show growth that belongs to other projects.

## P4 — Performance and rendering

- Measured HTML weight: `/` 240 KB, `/ar` 67 KB, `/blog` 42 KB, post 58 KB. All
  server-rendered, content present in the HTML source (verified by fetching and
  reading the markup, not by rendering).
- No Core Web Vitals field data exists for this domain. Lab measurement is required
  on a preview deployment before we make any speed claim.

## What we deliberately will not do

- No bulk generated pages with the country name swapped. Google's spam policies
  treat scaled low-value content as a violation, and the brief already forbids it.
- No fake `FAQPage` blocks, no invented statistics, no invented author bios.
- No changes to existing public URLs. Any future slug change needs a redirect map
  committed in the same PR.
