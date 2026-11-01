# Voice, recording and agent draft review

## Implemented

- `/studio/media`: browser speech recognition with explicit disclosure/opt-in,
  Arabic/English, editable transcript, text download/copy and existing browser
  text-to-speech helper. No STT fallback uploads in this notebook. Recognition
  may use the browser vendor's remote service, not necessarily on-device.
- Screen recording via user-initiated getDisplayMedia and actual MediaRecorder.
  Optional source audio (not microphone); no camera. Pause/resume/stop,
  browser-source end handling, 3-minute wall-time and ~50 MiB limit, local Blob
  preview/download/delete, track and object-URL cleanup. No screen feed to AI.
- `/studio/agent`: structured text brief, editable review and copy; optional
  one-hour sessionStorage handoff into an empty signed-in chat composer. Does
  not auto-send or start a run. Existing nonempty drafts are not overwritten.
  Session draft is tab-scoped, not user-bound; avoid shared devices.
- Searchable native command dialog in Studio; Ctrl/Cmd K and Escape.
- Permissions-Policy changes mic and display capture from blocked to same-origin
  only; camera/geolocation remain blocked. Browser permission is still required.

## Evidence and limitations

TypeScript and unit tests cover format selection, errors, bounded/expired drafts
and goal/approval wording. Browser tests exercise manual note download,
unsupported capture, denied permission, command navigation, agent brief creation,
actual MediaRecorder recording/download on a **synthetic canvas video source**,
pause/resume/delete and track release on leaving the route. Recognition callback
handling is tested with a **mock recognition engine**, not a real microphone.

These tests do NOT establish OS screen-picker permission on the user's device,
hardware microphone recognition, quality/availability of Arabic voices, actual
browser-vendor transcription, authenticated chat handoff at runtime, or live AI
voice conversation. No provider calls, billing operations or production changes
are part of these tests. A headed, permitted-device test is required before
claiming microphone/screen capture works on a specific user's browser.

The existing chat already has voice-input, server STT fallback and read-aloud
controls; this work does not claim to verify those remote services. It does not
fix previously observed database errors. Backends and real connectors require
independent authenticated tests. Existing experimental public Studio routes do
not expose account data or tokens.

## Manual device acceptance checklist

1. Use HTTPS on a supported browser. Open `/studio/media` and read the disclosure.
2. Opt into dictation, allow microphone, speak Arabic, stop and correct the text.
   Confirm nothing sends automatically; download and inspect the note.
3. Read a short note, stop reading, then navigate away and verify playback stops.
4. Choose a harmless test tab for screen capture; never choose private content.
   Record, pause, resume, stop and download. Play the file outside the app.
5. Repeat rejecting permission, ending share from browser controls, and navigating
   away while capturing. Verify browser capture indicator turns off.
6. Sign into a preview test account; create a brief then open a blank chat. Verify
   text stays a draft and no chat POST occurs until pressing Send. Do not use
   production credentials or trigger real provider writes for this check.

## Automated result — 2026-11-01

TypeScript passed; 31 unit tests plus model suite passed. Sixteen local browser
scenarios passed in 1.3 minutes: nine media/command/brief checks (including mocked
recognition and actual MediaRecorder on synthetic frames) plus seven existing
Studio regression scenarios. Targeted recommended lint and placeholder check
passed. No real microphone, OS screen picker, authenticated draft transfer or
external provider operation is included in that result.
