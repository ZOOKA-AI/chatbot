# Content Architecture — what exists, what we add, and how it is wired

## What the repository actually supports today

| Layer | Reality (read from code, 2026-11-23) |
| --- | --- |
| Storage | Table `BlogPost`: `slug, lang, title, excerpt, body, keyword, status, author, published_at` |
| Read | `lib/blog/store.ts` → `listPublishedPosts()`, `getPublishedPost()` |
| Render | `lib/blog/markdown.tsx` (Markdown subset) |
| Routes | `app/blog/page.tsx`, `app/blog/[slug]/page.tsx` |
| Write | `app/api/blog/publish/route.ts` (protected) |
| Locales | `app/ar/page.tsx` is the only Arabic route in the app |

`lang` already exists and accepts `'ar'`. **No migration is required to publish
Arabic content.** What is missing is routing, `hreflang`, and an Arabic index.

## Target structure

```
/                       English home (exists)
/ar                     Arabic home (exists)
/blog                   English index (exists)
/blog/{slug}            English post (exists)
/ar/blog                Arabic index          ← new
/ar/blog/{slug}         Arabic post           ← new
/pricing  /ar/pricing   ← Arabic pricing does not exist yet (404)
/solutions/*            ← not built, do not link to it
/regions/*              ← not built, do not link to it
```

The brief proposes `/solutions` and `/regions` trees. **Neither exists**, and
neither should be created before there is content to fill it. A country page is
earned, not reserved.

## Section taxonomy (maps to the `keyword` and `category` we record per post)

| Section | Purpose | Example slugs | Product link (must be live) |
| --- | --- | --- | --- |
| `ai-agents` | Pillar definitions and comparisons | `what-is-an-ai-agent`, `ai-agent-vs-chatbot` | `/compare/chatgpt`, signup |
| `automation` | Workflow and operations automation | `automate-customer-support`, `smart-workflow-step-by-step` | `/pricing` |
| `business-ai` | Owner/manager decisions | `choose-ai-agent-platform`, `ai-for-small-business` | `/pricing` |
| `developers` | n8n, MCP, APIs, GitHub | `what-is-n8n`, `connect-github-to-an-ai-agent` | `/developer` |
| `integrations` | Gmail, Drive, Calendar, GitHub, Vercel, n8n | `connect-ai-to-gmail` | `/developer`, signup |
| `tutorials` | Step-by-step with screenshots | `build-first-agent` | signup |
| `security` | Permissions, OAuth, data handling | `customer-data-with-ai-agents` | `/privacy` |

Only the product links marked live above resolve today (verified: `/pricing`,
`/compare/chatgpt`, `/developer` all 200; `/solutions` and `/regions` are 404).

## The pairing rule for bilingual content

Every article has a **topic key**. The English and Arabic versions share it.

- `slug` may differ per language (Arabic slugs stay Latin transliteration for
  URL safety).
- `hreflang` is emitted only when both sides are `published`.
- A one-language article is allowed. It is simply not advertised as a pair.

## Front matter contract for a post

```
slug        unique per language
lang        en | ar
title       <= 60 chars where possible
excerpt     1 sentence, used for meta description
keyword     the single primary query the post answers
author      a real named reviewer (or left null until confirmed)
status      draft until reviewed
published_at set only on publish
```

## What the CMS does not do (and we will not pretend it does)

- No revision history. An edit overwrites `body`. Keep source copies in the repo
  under `docs/growth/samples/` until revision support exists.
- No scheduled publishing. `status` flips to `published` at write time.
- No per-post image pipeline. Images must be absolute URLs to assets that already
  exist; no placeholder image paths.
