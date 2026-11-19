# ZOOKA AI — brand guide

Version 1.0, 16 November 2026. Visual-design workstream, branch `design/brand-identity-v1`, cut from
`main` (`19473c0`). It changes no application code, so the frozen release candidate (PR #95) is untouched.

## 0. What this pass could and could not use

The brief says to use seven supplied reference images. **They did not arrive in this workspace.** The newest
uploads here are dated 07:56 today and are not a seven-image set, and I have no way to read image contents in
this session. Everything below is therefore derived from the written specification (colours, slogans, the Z
symbol, the mascot requirement) and from what the repository already contains. When the references arrive, the
parts they legitimately affect are the mascot accessories, the social template composition and the Quranic
sub-brand — sections 5, 6 and 8 — and those are marked as such rather than guessed at.

## 1. Audit of what exists today

| Item | State in `main` | Verdict |
| --- | --- | --- |
| Logo raster | `public/images/zooka-logo-120.png`, `-512.png`; used in the site header at 36px | Raster only, no vector, no light variant, no symbol-only mark |
| Favicon | `app/favicon.ico` | Present, not derived from any documented mark |
| Wordmark on screen | `components/marketing/site-header.tsx` renders the PNG plus the text "Zooka AI" in a default sans | Wordmark casing and spacing are arbitrary, not specified anywhere |
| Brand colours | `#2E86AB`, `#A23B72`, `#F8F9FA` appear **nowhere** in `app/`, `components/`, `lib/` or `styles/` | The approved palette is undocumented in code. This is the largest gap: the identity exists in conversation, not in the product |
| Type | `Cairo` for Arabic and `Geist` for Latin, loaded in `app/layout.tsx` | Correct and already aligned with the intended pairing |
| Design tokens | None on `main` (the token file lives on an unmerged branch) | No single source of truth |
| App icon / PWA | `app/manifest.ts` references icons | No documented icon grid |

## 2. The logo

One drawing, generated from one outline (`docs/brand/tools/generate.py`), so the symbol, lockups, app icon,
avatar and favicon cannot drift apart.

**Construction.** A Z built from a top bar, a diagonal band and a bottom bar on a 100×100 grid with a 16-unit
margin, joined by a 4-unit round stroke. Body in the blue→purple gradient, top bar in the accent. The diagonal
carries the movement the brand asks for; the two bars keep it readable at 16px.

**Measured**, not assumed: a rendered 400×400 probe of the mark shows row coverage of 0.60 at the top bar,
0.32 across the diagonal, 0.60 at the bottom bar, and zero outside the mark. That is the shape being verified,
not a claim about it.

**Clear space.** Equal to the height of the top bar (18 units of the 100 grid) on all sides. Nothing enters it:
no text, no border, no neighbouring logo.

**Minimum size.** Symbol 16px; horizontal lockup 96px wide; vertical lockup 64px wide. Below the horizontal
minimum, use the symbol alone.

**Never.** Do not re-colour the gradient, outline it, add a drop shadow, rotate it, set it on a photograph
without a scrim, place it on a mid-tone background without a container, or rebuild it in another tool.

## 3. Colour, with the numbers that constrain it

| Role | Hex | On navy | On ice |
| --- | --- | --- | --- |
| Electric blue (primary) | `#2E86AB` | 4.56 (AA) | 3.9 (large only) |
| Purple (accent) | `#A23B72` | **3.04 (large only)** | 5.85 (AA) |
| Ice white | `#F8F9FA` | 17.76 (AAA) | — |
| Dark navy | `#0B1220` | — | 18.09 with ink |
| Cyan (neon, focus, active) | `#4FD1E8` | 10.36 (AAA) | — |
| Ink | `#0A1019` | — | 18.09 (AAA) |
| Muted text | `#8FA3B8` dark / `#5B6B7C` light | 7.22 (AAA) | 5.19 (AA) |

Three rules fall straight out of that table, and they are stricter than taste:

1. **Purple is never body text on navy.** 3.04:1 fails AA for anything under 18px. It is a display accent, a
   border, a gradient stop, or text on ice.
2. **The blue button with ice text is 3.9:1.** Either its label is at least 18px/600, or the primary action
   becomes cyan background with navy text (10.36). Both are acceptable; silently shipping 14px white on blue
   is not.
3. **Never a colour alone.** Every state (active, error, connected) carries an icon or a word as well.

Neon discipline: cyan appears as a 1px border, a 2px focus ring, a small glow on the mascot antenna, or a
60px radial bloom. It never fills a panel, and it never strobes. Motion respects `prefers-reduced-motion`.

## 4. Typography and layout

Arabic: **Cairo** (already loaded). Latin: **Inter** (Geist is currently loaded; Inter is specified here for
the wordmark's tighter spacing — swapping is a one-line change and needs approval). Code: Geist Mono.

Display 40–64px/tight, H1 32–44, H2 24–32, H3 20, body 16/1.6, small 14, caption 12. Latin letter-spacing is
`0.06em` on the wordmark only; Arabic never takes letter-spacing, because it breaks the joins.

Arabic-first rules, not an afterthought: `dir="rtl"` with logical properties (`margin-inline`, `padding-inline`,
`inset-inline-start`), mirrored chevrons, numbers and code left-to-right inside RTL, and both languages laid
out and screenshotted rather than assumed.

Spacing is a 4px scale (`--zk-1` … `--zk-24`). Radii 8/12/18/24/pill. Container 1200px, safe margin
`clamp(1rem, 5vw, 4rem)`.

## 5. The agent system

Seven agents share one robot. The silhouette, visor and chest Z never change; identity comes from tint plus one
accessory, so the family reads as one product:

| Agent | Tint | Accessory |
| --- | --- | --- |
| General | blue → purple | none: this is the base |
| Research | cyan → blue | magnifier at the right of the head |
| Writing | amber → purple | slanted stylus |
| Design | purple → indigo | three colour dots |
| Automation | blue → cyan | dashed ring, a loop |
| Analytics | green → blue | three bars |
| Support | indigo → purple | headset band and earcups |

The mascot is a guide, not a character with a biography. It does not speak in the product, it marks which agent
is answering. Files: `assets/agents/agent-*.svg`, 120×120, same construction as the mark.

## 6. Quranic educational sub-brand

A separate product with a shared parent. Read `QURAN_SUBBRAND.md` for the full rules. The two non-negotiables:
the sub-brand never borrows the robot mascot as if it were a religious authority, and every screen distinguishes
**verified source** (verse, tafsir with citation) from **AI explanation** (labelled, never blended).

## 7. Social

`SOCIAL_KIT.md` lists the templates and, more importantly, the claims rules: no verification badge, no account
presented as official unless it is, no illustrative statistic shown as real. Templates carry a `DEMO` chip
wherever a number appears.

## 8. What still needs the references

Mascot accessories (5), social composition (7) and the Quranic book-and-Z device (6) are specified from the
brief. The seven images would refine them. Nothing in sections 2 to 4 depends on those images.
