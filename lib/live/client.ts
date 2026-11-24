import { Room, Track } from "livekit-client";

type LiveTokenResponse =
  | { configured: false; reason: string }
  | { configured: true; url: string; token: string; expiresAt: number };

type PreparedToken = Extract<LiveTokenResponse, { configured: true }> & {
  slug: string;
};

const ROOM_SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

export async function fetchLiveToken(slug: string): Promise<LiveTokenResponse> {
  if (!ROOM_SLUG.test(slug)) {
    throw new Error("Invalid live session slug.");
  }

  const response = await fetch("/api/live/token", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Live session setup failed (HTTP ${response.status}).`);
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "configured" in payload &&
    payload.configured === false &&
    "reason" in payload &&
    typeof payload.reason === "string"
  ) {
    return { configured: false, reason: payload.reason };
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Live session setup failed (HTTP ${response.status}).`;
    throw new Error(message);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("configured" in payload) ||
    payload.configured !== true ||
    !("url" in payload) ||
    typeof payload.url !== "string" ||
    !("token" in payload) ||
    typeof payload.token !== "string" ||
    !("expiresAt" in payload) ||
    typeof payload.expiresAt !== "number"
  ) {
    throw new Error("The live session token response was invalid.");
  }

  return {
    configured: true,
    url: payload.url,
    token: payload.token,
    expiresAt: payload.expiresAt,
  };
}

export function createLiveSessionClient() {
  const room = new Room({ adaptiveStream: true, dynacast: true });
  let preparedToken: PreparedToken | null = null;

  return {
    room,
    async prepare(slug: string) {
      const response = await fetchLiveToken(slug);
      preparedToken = response.configured ? { ...response, slug } : null;
      return response;
    },
    async connect(slug: string) {
      if (!ROOM_SLUG.test(slug)) {
        throw new Error("Invalid live session slug.");
      }

      let token = preparedToken?.slug === slug ? preparedToken : null;
      if (!token || token.expiresAt <= Math.floor(Date.now() / 1000)) {
        const response = await fetchLiveToken(slug);
        if (!response.configured) {
          preparedToken = null;
          throw new Error(response.reason);
        }
        token = { ...response, slug };
      }

      preparedToken = null;
      await room.connect(token.url, token.token);
    },
    async publishCamera(track: MediaStreamTrack) {
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.Camera,
      });
    },
    async unpublishCamera(track: MediaStreamTrack) {
      await room.localParticipant.unpublishTrack(track);
    },
    async publishMicrophone(track: MediaStreamTrack) {
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.Microphone,
      });
    },
    async unpublishMicrophone(track: MediaStreamTrack) {
      await room.localParticipant.unpublishTrack(track);
    },
    async startScreenShare(track: MediaStreamTrack) {
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.ScreenShare,
      });
    },
    async stopScreenShare(track: MediaStreamTrack) {
      await room.localParticipant.unpublishTrack(track);
    },
    async disconnect() {
      preparedToken = null;
      await room.disconnect();
    },
  };
}

export type LiveSessionClient = ReturnType<typeof createLiveSessionClient>;
