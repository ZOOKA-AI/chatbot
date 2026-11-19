# Implementation plan (visual workstream)

Sequenced so nothing reaches the frozen release candidate. Each step is reversible and each step ends with
evidence, not a claim.

## Step 1 — Tokens land behind a flag (no visual change)

Add `styles/zooka-tokens.css` and import it in `app/layout.tsx`. Nothing consumes the variables yet, so the
rendered product is byte-identical and the existing screenshots still hold. Verify: build, `tsc`, and a
screenshot diff that is empty. Rollback: remove one import.

## Step 2 — Site header and favicon

Swap the raster logo for the new lockup (light and dark by theme), add the favicon set, set the wordmark
spacing from tokens. Files: `components/marketing/site-header.tsx`, `app/layout.tsx`, `app/manifest.ts`,
`public/images/*`. Verify: 375/768/1440 screenshots, RTL screenshot, no layout shift, contrast unchanged.

## Step 3 — Public pages

Landing, pricing, blog, help. Apply tokens, the gradient rule, and the cyan focus ring. Every displayed number
either comes from a live source or carries the `DEMO` chip. Verify: axe pass on each page, both languages.

## Step 4 — Auth and dashboard

Registration, login, dashboard, administration. This is where the accessibility rules bite: the primary button
either grows to 18px/600 or becomes cyan-on-navy. Verify: contrast measured on the rendered page, keyboard-only
walkthrough, focus visible on both surfaces.

## Step 5 — Product surfaces

Chat, Agents, Creative Studio, Video Studio, Automation, Integrations, Analytics, Developer, Security, Help.
Agent avatars come from `assets/agents/`. Integration tiles show a connected state only when the connection
exists in the database. Nothing else changes: these components work and are not restyled for taste.

## Step 6 — Quranic sub-brand

Separate route group, separate tokens subset, the three content labels wired to real data. Verify: no screen
renders generated text inside a verified-source frame.

## What this plan refuses to do

No component is replaced because it looks old. No feature is added. No metric is invented. No provider is shown
as connected before it is. If a page cannot be verified in both languages, it does not ship.
