# Social Distribution Plan — article to channel, without spam

## The rule that comes first

Nothing publishes automatically to an external account. Every post is prepared as a
draft and published by a human, or through an explicitly authorized workflow that
the owner has approved. ROYAL HAROON accounts are never used for ZOOKA-AI content,
and ZOOKA-AI accounts are never used for Royal content.

## Available ZOOKA-AI channels (state verified earlier, unchanged here)

| Channel | Account state | Publishing path today |
| --- | --- | --- |
| LinkedIn | Connected as the owner (scopes `openid profile email w_member_social`) | Manual or approved workflow |
| X | Connected (`tweet.write`, `users.read`) | Manual or approved workflow |
| Facebook page "ZOOKA AI" | Created and verified, images still missing | Manual only |
| Instagram `@zooka.ai7` | Bio set; web cannot switch to Business | Manual only |
| Telegram | Bot channel exists | Manual or approved workflow |
| YouTube | Channel exists, zero videos | Manual only |
| TikTok | **No ZOOKA app exists** | Not available — do not promise it |

## Per-article package (produced with the article, not after it)

For each approved article, one file containing:

1. **LinkedIn** — 120-180 words, one concrete claim from the article, one link.
2. **X** — a 3-post thread: the problem, the mechanism, the link. No hashtag stuffing.
3. **Facebook** — 60-90 words, plain language, one image.
4. **Telegram** — 2-3 lines, link only.
5. **YouTube idea** — one sentence describing the video, plus 3 bullet beats.
6. **Short video script** — 30-45 seconds, hook, demo beat, CTA. Written for the
   vertical format we already produce.
7. **Newsletter draft** — 150 words, one article, one CTA.

## Cadence

| Channel | Frequency | Why |
| --- | --- | --- |
| LinkedIn | 3 per week | Where the owner's professional audience already is |
| X | 4 per week | Cheap distribution, weak for Arabic B2B but compounds |
| Telegram | 1 per week digest | Low effort, keeps the early audience warm |
| YouTube / short video | 1 per week | Highest cost, highest trust; only for the best articles |
| Facebook | 2 per week | Page is verified but visually incomplete |

## Anti-spam rules

- Never post the same text to two channels in the same hour; rewrite the opening.
- Never link to an article that is not indexed yet. Distribution before indexing
  sends traffic to a page Google does not know, and wastes the post.
- No engagement bait, no fake urgency, no invented customer results.
- Arabic copy is written in Arabic, not machine-translated from the English draft.

## Measurement

Social is measured by referral sessions in GA4 and by `signupSource` when a UTM is
present. Without a UTM, a social signup is indistinguishable from direct traffic, so
every social link carries:

```
?utm_source=linkedin|x|telegram|facebook&utm_medium=social&utm_campaign={cluster}
```

That UTM is the only reason `signupSource` will be able to say "linkedin" later.
