# Visual acceptance report

Branch `design/brand-identity-v1`, cut from `main` `19473c0`. Application code changed: **none**. Frozen
release candidate (PR #95, `1413fbb`): **untouched**.

## Verified in this pass

| Item | Evidence |
| --- | --- |
| 27 assets generate deterministically | `python3 docs/brand/tools/generate.py` prints each file; re-running produces identical output |
| The mark is the mark | rendered 400×400 probe measured for row coverage: 0.60 (top bar), 0.32 (diagonal), 0.60 (bottom bar), 0 outside |
| Palette contrast measured, not assumed | 12 pairs computed; purple-on-navy 3.04 and ice-on-blue 3.9 recorded as restrictions |
| Assets render in a real browser | Chromium contact sheet, 5216 distinct colours, agent row 1223, light panel present |
| Board renders in both languages and three widths | `acceptance/board-375.png`, `board-768.png`, `board-1440.png`, `board-1440-ar.png` |
| No horizontal overflow at the narrow width | injected probe reports `clientWidth` 485 and `scrollWidth` 485, zero offending elements. The 375 file is a scaled capture of that 485px layout, which is why it is not a pixel-exact 375 layout |

## Accessibility review

Rules derived from measurement: purple never body text on navy; blue CTA label ≥18px/600 or cyan-on-navy
button; body text on dark restricted to ice and `#8FA3B8`; 2px cyan focus ring with offset, visible on both
surfaces; every icon-only control carries a localised `aria-label`; `prefers-reduced-motion` zeroes durations.

Not yet true: the running product still uses the old palette and the old raster logo, so these rules describe
the system, not the current site. The site is measured in step 2 of the plan and reported then.

## Responsive review

Breakpoints: 360, 768, 1024, 1440, 1920. Container 1200px, safe margin `clamp(1rem,5vw,4rem)`, RTL mirrored with
logical properties. Verified on the style-guide board at 375 / 768 / 1440; the product pages are reviewed in
steps 2 to 5.

## Not done, and why

- No PNG export of the marks yet (needs approval to touch `public/` and the header).
- No application of tokens to the product: that is a visual change to a frozen release candidate.
- No use of the seven supplied images: they were not received.
- No social account status claimed: none was verified in this pass, so no account is asserted to exist.

## Approval needed before any of it lands

Merge of this branch, PNG export into `public/`, header and favicon swap, and steps 3 to 6 — each a separate
decision, none of them taken here.
