# Logo specification

## Grid

100×100 units, 16-unit margin, so the mark occupies 68% of its box. Top bar `y 18–34`, diagonal band from
`(84,36)` to `(44,66)`, bottom bar `y 66–82`, all full width between x 16 and 84, joined by a 4-unit round
stroke. The diagonal is the only curve-free diagonal in the system; nothing else in the identity uses that angle.

## Variants and when to use each

| Variant | Use | Never |
| --- | --- | --- |
| `logo-horizontal-*` | Headers, documents, decks | Below 96px wide |
| `logo-horizontal-*-tagline` | Landing hero, print | On busy imagery |
| `logo-vertical-*` | Square placements, merch | In a horizontal bar |
| `symbol-*` | App chrome, favicons, avatars | As the first mention of the brand |
| `symbol-mono-ice` / `-mono-ink` | One-colour print, embossing, watermarks | Over a gradient |
| `app-icon-*` | Store listing, PWA | With rounded corners added on top |
| `avatar-512` | Social profiles | Cropped tighter than the built-in safe area |

## Colour by surface

On navy: gradient mark, ice wordmark, cyan "AI". On ice: gradient mark, ink wordmark, purple "AI". Mono variants
exist for single-colour reproduction only; the gradient is the identity.

## Favicon

The 16px file is drawn separately, not scaled: same Z, tighter inset, no stroke glow. A scaled-down 1024 icon
turns to mush at 16px, which is why the small size has its own file.
