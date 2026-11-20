import type { Participant } from "livekit-client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

const liveKit = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("livekit-client", () => ({
  ConnectionState: { Disconnected: "disconnected" },
  Room: class {
    localParticipant = {};
    remoteParticipants = new Map();
    on = vi.fn();
    off = vi.fn();
    connect = liveKit.connect;
    disconnect = liveKit.disconnect;
  },
  RoomEvent: {
    ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    TrackMuted: "trackMuted",
    TrackUnmuted: "trackUnmuted",
    LocalTrackUnpublished: "localTrackUnpublished",
    ConnectionStateChanged: "connectionStateChanged",
    Disconnected: "disconnected",
  },
  Track: {
    Kind: { Audio: "audio", Video: "video" },
    Source: {
      Camera: "camera",
      Microphone: "microphone",
      ScreenShare: "screen_share",
    },
  },
}));

import {
  LiveSessionStatus,
  ParticipantTile,
} from "@/components/live-session-console";
import { createLiveSessionClient, fetchLiveToken } from "@/lib/live/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("live session console availability", () => {
  test("shows the feature as unavailable when the token route is not configured", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { configured: false, reason: "live_not_configured" },
          { status: 503 }
        )
      );
    vi.stubGlobal("fetch", fetch);

    const availability = await fetchLiveToken("session-123");
    const html = renderToStaticMarkup(
      createElement(LiveSessionStatus, {
        availability: availability.configured
          ? { status: "ready" as const }
          : { status: "unavailable" as const, reason: availability.reason },
        lang: "en",
        onJoin: vi.fn(),
      })
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/live/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ slug: "session-123" }),
      })
    );
    expect(html).toContain(
      "Live sessions are unavailable: LiveKit is not configured."
    );
    expect(html).not.toContain("Join session");
  });

  test("renders a join control after a successful token response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          configured: true,
          transport: "livekit",
          url: "wss://live.example.test",
          room: "server-derived-room",
          token: "server-issued-token",
          expiresAt: 1_900_000_000,
        })
      )
    );

    const availability = await fetchLiveToken("session-123");
    const html = renderToStaticMarkup(
      createElement(LiveSessionStatus, {
        availability: availability.configured
          ? { status: "ready" }
          : { status: "idle" },
        lang: "en",
        onJoin: vi.fn(),
      })
    );

    expect(html).toContain("<button");
    expect(html).toContain("Join session");
  });

  test("renders camera and screen-share tracks as separate remote videos", () => {
    const participant = {
      name: "Ada",
      identity: "ada-identity",
      trackPublications: new Map([
        ["camera", { kind: "video", track: { sid: "camera-track" } }],
        ["screen", { kind: "video", track: { sid: "screen-track" } }],
      ]),
    } as unknown as Participant;

    const html = renderToStaticMarkup(
      createElement(ParticipantTile, { participant })
    );

    expect(html.match(/<video/g)).toHaveLength(2);
    expect(html).toContain("Ada");
  });

  test("renders the connection error text", async () => {
    liveKit.connect.mockRejectedValueOnce(
      new Error("WebSocket connection was refused.")
    );
    liveKit.disconnect.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          configured: true,
          transport: "livekit",
          url: "wss://live.example.test",
          room: "server-derived-room",
          token: "server-issued-token",
          expiresAt: 1_900_000_000,
        })
      )
    );

    const client = createLiveSessionClient();
    await client.prepare("session-123");
    const availability = await client.connect("session-123").then(
      () => ({ status: "ready" as const }),
      (error: unknown) => ({
        status: "error" as const,
        message: error instanceof Error ? error.message : String(error),
      })
    );

    const html = renderToStaticMarkup(
      createElement(LiveSessionStatus, {
        availability,
        lang: "en",
        onJoin: vi.fn(),
      })
    );

    expect(liveKit.connect).toHaveBeenCalledWith(
      "wss://live.example.test",
      "server-issued-token"
    );
    expect(html).toContain("WebSocket connection was refused.");
  });
});
