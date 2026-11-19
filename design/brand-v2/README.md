# ZOOKA AI — visual system v2

Approved identity, applied as code rather than as pictures of code.

## Palette (fixed by the owner)

| Token | Hex | Use |
|---|---|---|
| Electric blue | `#2E86AB` | primary brand, buttons, links |
| Royal purple | `#A23B72` | secondary accent, emphasis, gradients |
| Ice white | `#F8F9FA` | light canvas, text on dark |
| Dark navy | `#0B1220` | primary canvas |
| Neon cyan | `#10D4FF` | focus, glow, active state |

Slogans: **تقنية بإيمان، تقدّم بأخلاق** · **Innovate • Automate • Grow**

## What exists in this folder

```
tokens/zooka-tokens.css     colour, type, space, radius, elevation, motion
tokens/tokens.ts            typed mirror for runtime use
logo/zooka-mark.svg         the mark (gradient, transparent)
logo/zooka-mark-mono-*.svg  single-colour marks for stamps and print
logo/zooka-logo-horizontal-{en,ar}.svg
logo/zooka-logo-vertical-{en,ar}.svg
icon/favicon.svg            app/favicon + browser tab
icon/app-icon-512.svg       store/PWA icon
icons/agents/*.svg          12 agent glyphs, one visual grammar
gallery/index.html          25 pages × {desktop, mobile} × {LTR, RTL}
gallery/pages.json          the page register
```

Rendered PNGs live in `public/brand/` (app icon, favicon sizes, apple touch icon,
logo lockups, Open Graph card) and are produced from the SVGs with `sharp`, so
they cannot drift from the vector source.

## Rules held in the gallery

- No invented screenshots: the gallery renders layout systems, and placeholder
  panels stand in for data that does not exist yet.
- No fabricated claims: no customer counts, funding, certifications or ratings
  appear anywhere in these assets.
- Bilingual by construction: every page is rendered in Arabic RTL and English
  LTR from the same markup, not translated afterwards.
- Motion respects `prefers-reduced-motion`.

## Still open

- Mascot poses beyond the base character sheet (generated separately).
- Photographic/video assets for reels, intros and thumbnails.
- The Quranic sub-brand (ZEKR) has a typographic treatment here but no dedicated
  logo mark yet.
