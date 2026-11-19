# Mobile composer submit layout

Cause: fixed-width model selector plus voice/agent/attachment controls in one
unconstrained flex row exceeded mobile composer width. The form clips overflow.
An isolated browser reproduction of the previous single-line geometry at 320px
placed submit at x=-229 in RTL, outside the visible form.

Fix: allow tool wrapping inside a min-width-zero flexible column, reserve a
nonshrinking submit/stop slot, and use a 40px send target with localized label.
Composer cannot shrink vertically; messages explicitly can shrink, with bottom
safe-area padding. No send transport, model or auth behavior changed.

Run `pnpm test:composer`. The runner creates a temporary local route referencing
real PromptInput primitives plus representative controls and removes it afterward;
no test route or authentication bypass is published. Twelve cases cover RTL/LTR
at 320/360/390/430 mobile widths, short 390×360 viewport and 1280×800 desktop,
asserting submit bounds and actual form click. This is isolated geometry testing,
not an authenticated model response test or real hardware keyboard test.

A short viewport approximates keyboard space but does not exercise iOS/Android
visualViewport/keyboard overlays. Validate on a signed-in preview account with
actual mobile keyboards before claiming full device coverage. The preview browser
has no application account, so the private chat flow cannot be fully exercised.

Verification: 12 layout cases passed in 17s; initial reproduction confirmed prior
send slot x=-229 at 320px RTL. Unit suite passed. Typecheck passed. Repository-wide
lint reports broad existing import/style violations outside this change; not
silenced or bulk-fixed here. Authenticated preview chat still requires a test
account and actual keyboard checks. No production promotion is part of this PR.
