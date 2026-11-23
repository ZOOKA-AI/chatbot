# Keyword Research — method, real evidence, and honest gaps

## 1. What we can prove today

Search Console, `sc-domain:zooka-ai.com`, 28 days to 2026-11-23: **12 queries total**.
The full list is in `SEO-BASELINE-AUDIT.md` §3. Reading it tells us three things:

- The only query with clicks is the brand (`zooka`, 4 clicks, position 16.3).
- The Arabic queries we do appear for are accidental: `زؤخة`, `زكاك اصطناعي`,
  `الذكاء الاصطناعي الاسلامي`, `ذكاء اصطناعي إسلامي`, `موقع ذكاء اصطناعي عربي`.
- Not one target term appears. No `وكيل ذكاء اصطناعي`, no `أتمتة`, no `n8n`,
  no `واتساب`, no `ربط جيميل`.

That absence is the baseline. Everything below is a hypothesis to be tested, not
a measured market.

## 2. Sources actually available in this workspace

| Source | Status | What it gives us |
| --- | --- | --- |
| Google Search Console | **Connected** (`webmasters.readonly`) | Real queries, positions, countries — the only hard data |
| Google Analytics 4 | **Connected** (property "Zooka AI") | Behaviour and landing pages, no query data |
| Keyword volume tool (Ahrefs/Semrush/etc.) | **NOT CONNECTED** | No search volumes. Any volume we print would be invented |
| Google Trends | **NOT CONNECTED** | Relative interest only, and not accessible here |
| Google autocomplete | Usable manually via search UI | Real phrasing and long-tail variants, no volume |
| Competitor pages | Usable manually | Structure and gaps, never to copy |

**Rule:** a keyword enters the calendar with `volume: NOT VERIFIED` unless a real
source is attached in the same row. Nobody may quote an unverified number.

## 3. Cluster map (hypotheses to validate)

Each cluster is one editorial pillar with supporting articles. The `Test query`
column is the single Arabic phrase we will watch in Search Console to decide
whether the cluster deserves more articles.

| Cluster | Pillar article | Test query (Arabic) | Supporting articles | Intent | Product link |
| --- | --- | --- | --- | --- | --- |
| AI agent fundamentals | ما هو وكيل الذكاء الاصطناعي؟ | `وكيل ذكاء اصطناعي` | agent vs chatbot, agent vs employee, how to build one | Informational | `/compare/chatgpt`, signup |
| Automation | أتمتة الأعمال بالذكاء الاصطناعي | `أتمتة الأعمال` | customer support automation, workflow step-by-step, marketing automation | Commercial | `/pricing` |
| Business AI | كيف تختار منصة وكلاء ذكاء اصطناعي؟ | `منصة ذكاء اصطناعي` | small business AI, cost of AI vs hire, AI for ecommerce | Commercial investigation | `/pricing` |
| Developers | ما هو n8n وكيف تستخدمه؟ | `n8n شرح` | MCP explained, connect GitHub, API basics | Informational, technical | `/developer` |
| Integrations | ربط الذكاء الاصطناعي بجوجل درايف وجيميل | `ربط جيميل بالذكاء الاصطناعي` | WhatsApp business, Calendar, Vercel | Commercial | `/developer`, signup |
| Security | حماية بيانات العملاء عند استخدام وكلاء AI | `بيانات العملاء الذكاء الاصطناعي` | OAuth explained, permissions model | Trust | `/privacy` |
| Local (earned) | — | — | only where local evidence exists | — | — |

## 4. Long-tail harvesting method (no tool required)

For each cluster, run the phrase in Google and record autocomplete variants. They
are real user phrasing even without volume data. Then keep only variants that:

1. a real person would type to solve a task (not a keyword-stuffed string),
2. we can answer better than the current results,
3. map to a feature that works today.

Record them in this shape, one row per phrase:

```
phrase | cluster | country focus | intent | volume: NOT VERIFIED | source: autocomplete 2026-11-23 | target page | conversion goal
```

## 5. What we will not do

- No invented volumes, no invented difficulty scores.
- No copying competitor outlines and rewriting them.
- No keyword cannibalisation: one primary query per URL. If two articles answer the
  same query, one becomes a section of the other.

## 6. First measurement checkpoint

After the first 12 articles are indexed (not merely published), re-run the GSC
query pull and compare:

- Arabic queries with at least one impression (target: 10),
- queries where we rank in the top 30 (target: 5),
- clicks from countries other than the UAE (target: at least 1).

If none of those move, the problem is not the keyword list. It is indexing, and the
fix stays in `TECHNICAL-SEO-PLAN.md` P0.
