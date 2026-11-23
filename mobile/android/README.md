# ZOOKA-AI for Android

The site (https://zooka-ai.com) in a WebView, plus native screen sharing for live sessions.
Android browsers have no `getDisplayMedia`, so no web page can share a phone's screen; this app
captures it with MediaProjection and publishes it into the same LiveKit room.

## How it works

1. The live session page detects `window.ZookaNative` (injected by the app as a WebMessageListener
   that the WebView scopes to `https://zooka-ai.com`) and sends `{"type":"hello"}`.
2. The app answers `{"type":"hello","screen":true}`, so the page enables its Screen button.
3. On tap, the page mints a fresh single-room token at `/api/live/token` with the member's own
   session and posts `{"type":"screen:start","url","token"}`.
4. The app asks Android for screen-capture consent, joins the room as a second participant
   (LiveKit Android SDK) and publishes only the screen track, with the system's capture
   notification as the way to stop. It reports `{"type":"screen","state":"started|stopped|error"}`.

The app stores no credential. Only zooka-ai.com pages load inside it; every other link opens in
the system browser.

## Build and download

CI (`.github/workflows/android.yml`) builds on every change under `mobile/android/` and, on `main`,
publishes the APK at:

https://github.com/ZOOKA-AI/chatbot/releases/download/android-latest/zooka-live.apk

Locally: `gradle assembleDebug` in this folder (JDK 17, Android SDK 35, Gradle 8.10).

## Known limits

- Google sign-in does not run inside Android WebViews (Google blocks it); sign in with email
  inside the app.
- The APK is signed with a CI-held development key. Before a Play Store release, add a release
  keystore as a repository secret and sign `assembleRelease` with it.
