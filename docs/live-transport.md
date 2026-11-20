# Live transport (audio, camera, screen)

The chat console captures camera, microphone and screen on the local device only. Sending
that media to another participant needs a media server; a browser cannot do it alone.

This repository now carries the server half of that path and nothing more:

- `lib/live/token.ts` builds the room name and signs the access token (HS256, `video` grant
  scoped to a single room).
- `app/api/live/token/route.ts` mints a token for the signed-in member of the session's
  workspace. The room always carries the workspace prefix, so a member cannot request
  another tenant's room.

## Configuration

Three environment values, all required. When any is absent the route answers
`503 { configured: false, reason: "live_not_configured" }` and the UI must show the feature
as unavailable rather than drawing a session that does not exist.

| Variable | Value |
| --- | --- |
| `LIVEKIT_URL` | `wss://<project>.livekit.cloud` |
| `LIVEKIT_API_KEY` | API key from the LiveKit project |
| `LIVEKIT_API_SECRET` | API secret from the LiveKit project |

## What is not built yet

The client half: joining the room, publishing local tracks, rendering remote participants,
and screen-share replacement. Until that lands and the three values are set, no two devices
exchange media and the product must say so.
