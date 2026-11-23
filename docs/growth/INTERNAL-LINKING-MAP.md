# Internal Linking Map

Internal links are how Google discovers pages and how readers move toward the
product. Today the map has a hole: the Arabic homepage is unreachable from the
English site (0 anchors).

## Verified link state (fetched 2026-11-23)

| From | To | Anchors found |
| --- | --- | --- |
| `/` | `/blog` | 2 |
| `/` | `/ar` | **0** |
| `/ar` | `/blog` | 1 |
| `/blog` | `/blog/{slug}` | 1 (the only post) |
| `/blog/{slug}` | other posts | none (no related-posts block) |

## Target map

```
                 ┌──────────────┐
                 │  /  (en)     │◄──── language switcher ────┐
                 └──────┬───────┘                            │
        ┌───────────────┼────────────────┐                   │
        ▼               ▼                ▼                   │
     /blog          /pricing       /compare/chatgpt          │
        │               │                │                   │
        ▼               │                │                   │
  /blog/{slug} ─────────┴────────────────┘                   │
        │  ▲                                                 │
        │  └── related posts (same cluster)                  │
        ▼                                                    │
   signup / demo                                             │
                                                             │
                 ┌──────────────┐                            │
                 │  /ar (ar)    │────────────────────────────┘
                 └──────┬───────┘
                        ▼
                    /ar/blog  ──►  /ar/blog/{slug}  ──►  signup
```

## Rules

1. **Every public page links to its language counterpart** through the switcher.
   This is the P0.2 fix and it is the cheapest indexing win available.
2. **Every article links up** to its cluster pillar, and **sideways** to at most
   three sibling articles. No article is an orphan.
3. **Every article has exactly one primary product CTA**, pointing at a page that
   returns 200 today: `/pricing`, `/compare/chatgpt`, `/developer`, or the signup
   flow. Never `/solutions/*` or `/regions/*` until they exist.
4. **Anchor text is descriptive Arabic**, not "اضغط هنا". Vary it naturally; do
   not repeat the exact same anchor across dozens of posts.
5. **No link to a 404.** A pre-publish check fetches every internal link in the
   post body and fails the draft if any returns 404.
6. **Breadcrumbs on every article**, already emitted as `BreadcrumbList` on the
   existing post. Keep them and mirror them visually.

## Cluster hubs to build as the article count grows

| Hub | Becomes worth building at | Links out to |
| --- | --- | --- |
| `/blog` (exists) | now | all posts, paginated |
| `/ar/blog` (new) | with the first Arabic post | all Arabic posts |
| Cluster pillar pages | 5+ posts in one cluster | its supporting posts |
| `/solutions/{use-case}` | when a real customer case exists | the articles that support it |

## Enforcement

Add a test to the existing suite: for each `published` post, fetch the rendered
HTML and assert (a) at least one internal link, (b) the language counterpart link
exists, (c) no internal link returns 404. This is the only way the map stays true
after the first ten posts.
