# Content Quality Checklist

A post ships only when every box is ticked. This exists because the failure mode of
a 52-article plan is not bad writing, it is unreviewed writing published at volume.

## Before writing

- [ ] One primary query, recorded in the brief, with `volume: NOT VERIFIED` unless
      a real source is attached.
- [ ] One cluster, one pillar it links up to.
- [ ] One product CTA pointing at a page that returns 200 today.
- [ ] The question the reader is actually asking, written in one sentence.

## While writing

- [ ] The first paragraph answers the question. No warm-up.
- [ ] At least one concrete example from real usage. If we have no real example, the
      article says so instead of inventing one.
- [ ] Every technical claim is either demonstrated or cited to a primary source
      (official docs, the vendor's own documentation).
- [ ] Arabic is written as Arabic. No translated-English sentence structure.
- [ ] Terminology is consistent with the product UI (وكيل، أتمتة، تكامل).
- [ ] No invented statistics. No invented customer stories. No invented expert names.
- [ ] Where ChatGPT or a competitor is genuinely better, the article says so.

## Before publishing

- [ ] Every internal link fetched and returns 200.
- [ ] Every external source link opens and supports the sentence it is attached to.
- [ ] `title` under ~60 characters, `excerpt` usable as a meta description.
- [ ] `keyword` set to the single primary query.
- [ ] A real named reviewer has approved it. **No name, no publish.**
- [ ] `datePublished` is today; `dateModified` is not a copy of it by accident.
- [ ] The language counterpart exists, or `hreflang` is deliberately omitted.

## After publishing

- [ ] URL submitted for indexing in Search Console.
- [ ] The page appears in the sitemap.
- [ ] Seven days later: impressions and position recorded, or the article is
      rewritten before a sibling is published.

## Automatic fails

These reject a draft outright:

- A CTA to a feature that does not work.
- A link to `/solutions/*` or `/regions/*` (both 404 today).
- A country page whose only local content is the country name.
- A claim of legal compliance (PDPL, GDPR, data residency) without a verified basis.
- Duplicated text from another article on the same site.
