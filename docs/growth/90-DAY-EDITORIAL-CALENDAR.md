# 90-Day Editorial Calendar

Target: **52 articles if quality holds, 30 if it does not.** The brief says it
itself: 30 excellent articles beat 100 weak ones. This calendar treats the number
as a ceiling, not a quota.

Hard rule: nothing publishes until the site can be crawled. Days 1-15 are therefore
technical, not editorial.

## Month 1 — foundation and the first twelve

| Days | Work | Output | Gate |
| --- | --- | --- | --- |
| 1-5 | Baseline audit (done), sitemap submission, language switcher, `/ar` internal links | Indexed Arabic homepage | GSC shows `/ar` crawled |
| 6-10 | `/ar/blog` route, `hreflang` pairs, Person author decision | Blog crawlable in both languages | URL Inspection no longer says "unknown" |
| 11-15 | Cluster keyword harvest, editorial briefs for 12 posts | 12 approved briefs | Every brief names one primary query and one working CTA |
| 16-30 | Publish 12 articles: 8 Arabic, 4 English | 12 published posts | Each passes `CONTENT-QUALITY-CHECKLIST.md` |

The twelve, in order (Arabic unless noted):

| # | Slug | Cluster | Primary query (AR) | CTA |
| --- | --- | --- | --- | --- |
| 1 | `what-is-an-ai-agent` | ai-agents | وكيل ذكاء اصطناعي | `/compare/chatgpt` |
| 2 | `ai-agent-vs-chatbot` | ai-agents | الفرق بين AI Agent وChatbot | `/compare/chatgpt` |
| 3 | `build-your-first-ai-agent` | tutorials | كيف أنشئ وكيل ذكاء اصطناعي | signup |
| 4 | `ai-for-small-business` | business-ai | الذكاء الاصطناعي للشركات الصغيرة | `/pricing` |
| 5 | `automate-customer-support` | automation | أتمتة خدمة العملاء | `/pricing` |
| 6 | `connect-ai-to-gmail-drive` | integrations | ربط جيميل بالذكاء الاصطناعي | `/developer` |
| 7 | `what-is-n8n` | developers | شرح n8n | `/developer` |
| 8 | `what-is-mcp` | developers | MCP شرح | `/developer` |
| 9 | `ai-agent-platform-checklist` | business-ai | اختيار منصة وكلاء ذكاء اصطناعي | `/pricing` |
| 10 | `customer-data-with-ai-agents` | security | حماية بيانات العملاء | `/privacy` |
| 11 | `how-an-ai-agent-automates-admin` (EN, exists) | ai-agents | — | refresh + Arabic pair |
| 12 | `chatgpt-vs-execution-agents` (EN) | ai-agents | — | `/compare/chatgpt` |

## Month 2 — depth and the first local research

| Days | Work | Output |
| --- | --- | --- |
| 31-45 | 10 more articles from clusters that showed impressions | 10 posts |
| 46-60 | Country research for the top three measured countries; only then local pages | 2 local pages maximum + 8 posts |

Month 2 decision rule: a cluster gets more articles only if it produced at least
one impression in Search Console. No impressions means the topic is not being
searched the way we wrote it, and we rewrite rather than repeat.

## Month 3 — refresh and conversion

| Days | Work | Output |
| --- | --- | --- |
| 61-75 | Refresh the five best-performing articles (real data, new examples, updated dates) | 5 refreshed |
| 76-90 | Conversion work: CTA placement, in-article demo, registration attribution | Measured funnel |

## Per-article production contract

1. Brief approved: one primary query, one CTA, one cluster.
2. Draft written with a real example and cited sources.
3. Technical review: every internal link returns 200, every claim verifiable.
4. Named human reviewer signs off. No name, no publish.
5. Publish, then request indexing in Search Console.
6. Seven days later: record impressions and position. No data, no follow-up article
   in that cluster.

## What counts as done

Publishing is not done. Indexed is not done. **A click from a target country** is
the first real signal, and a registration from that click is the goal.
