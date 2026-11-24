# Live transport (audio, camera, screen)

The chat console can join a LiveKit room to publish camera, microphone and screen tracks and
render subscribed participant tracks. When the LiveKit environment values are absent, it
shows the feature as unavailable.

The server mints a workspace-scoped token, and the browser client connects using only the
chat slug:

- `lib/live/token.ts` builds the room name and signs the access token (HS256, `video` grant
  scoped to a single room).
- `app/api/live/token/route.ts` mints a token for the signed-in member of the session's
  workspace. The room always carries the workspace prefix, so a member cannot request
  another tenant's room.
- `lib/live/client.ts` requests that token and connects the `livekit-client` room without
  accepting a room name from the browser.
- `components/live-session-console.tsx` provides pre-join local preview, publishing controls,
  and participant tiles.

## Configuration

Three environment values, all required. When any is absent the route answers
`503 { configured: false, reason: "live_not_configured" }` and the UI must show the feature
as unavailable rather than drawing a session that does not exist.

| Variable | Value |
| --- | --- |
| `LIVEKIT_URL` | `wss://<project>.livekit.cloud` |
| `LIVEKIT_API_KEY` | API key from the LiveKit project |
| `LIVEKIT_API_SECRET` | API secret from the LiveKit project |

Without all three values, the token endpoint returns
`503 { configured: false, reason: "live_not_configured" }` and the console stays visibly
unavailable. Room media exchange requires those credentials and a reachable LiveKit service;
it has not been verified without provider credentials.
