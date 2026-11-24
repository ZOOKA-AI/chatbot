"use client";

import {
  ConnectionState,
  type LocalTrackPublication,
  type Participant,
  RoomEvent,
  Track,
} from "livekit-client";
import {
  Camera,
  LogIn,
  LogOut,
  Mic,
  MonitorUp,
  Radio,
  Settings2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  createLiveSessionClient,
  fetchLiveToken,
  type LiveSessionClient,
} from "@/lib/live/client";
import {
  detectMediaSupport,
  getDisplayMediaCompat,
  getUserMediaCompat,
  type MediaSupport,
  supportNotice,
} from "@/lib/live/media-support";
import {
  ANDROID_APP_URL,
  createNativeScreenBridge,
  getNativePort,
  type NativeScreenBridge,
} from "@/lib/live/native-bridge";
import { cn } from "@/lib/utils";

type QualityMode = "balanced" | "performance" | "high";
type Availability =
  | { status: "idle" | "loading" | "ready" }
  | { status: "unavailable"; reason: string }
  | { status: "error"; message: string };

function videoConstraint(mode: QualityMode): MediaTrackConstraints {
  if (mode === "performance") {
    return {
      width: { ideal: 854 },
      height: { ideal: 480 },
      frameRate: { ideal: 24, max: 30 },
    };
  }
  if (mode === "high") {
    return {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60, max: 60 },
    };
  }
  return {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  };
}

function qualityLabel(mode: QualityMode, lang: "ar" | "en") {
  if (mode === "performance") {
    return lang === "ar" ? "أداء (480p)" : "Performance (480p)";
  }
  if (mode === "high") {
    return lang === "ar" ? "عالي (1080p)" : "High quality (1080p)";
  }
  return lang === "ar" ? "متوازن (720p)" : "Balanced (720p)";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function participantTracks(participant: Participant, kind: Track.Kind) {
  return Array.from(participant.trackPublications.values()).flatMap(
    (publication) =>
      publication.kind === kind && publication.track ? [publication.track] : []
  );
}

function unavailableMessage(reason: string, lang: "ar" | "en") {
  if (reason === "live_not_configured") {
    return lang === "ar"
      ? "الجلسات المباشرة غير متاحة: لم يتم إعداد LiveKit."
      : "Live sessions are unavailable: LiveKit is not configured.";
  }
  return lang === "ar"
    ? `الجلسات المباشرة غير متاحة (${reason}).`
    : `Live sessions are unavailable (${reason}).`;
}

export function LiveSessionStatus({
  lang,
  availability,
  connecting = false,
  onJoin,
}: {
  lang: "ar" | "en";
  availability: Availability;
  connecting?: boolean;
  onJoin: () => void;
}) {
  const isArabic = lang === "ar";

  if (availability.status === "loading") {
    return (
      <p className="text-muted-foreground text-xs" role="status">
        {isArabic
          ? "جارٍ التحقق من إعداد الجلسة المباشرة…"
          : "Checking live session availability…"}
      </p>
    );
  }
  if (availability.status === "unavailable") {
    return (
      <p className="text-muted-foreground text-xs" role="status">
        {unavailableMessage(availability.reason, lang)}
      </p>
    );
  }
  if (availability.status === "error") {
    return (
      <p className="text-destructive text-xs" role="alert">
        {availability.message}
      </p>
    );
  }
  if (availability.status === "ready") {
    return (
      <Button disabled={connecting} onClick={onJoin} type="button">
        <LogIn className="size-4" />
        {connecting
          ? isArabic
            ? "جارٍ الانضمام…"
            : "Joining…"
          : isArabic
            ? "انضم إلى الجلسة"
            : "Join session"}
      </Button>
    );
  }
  return null;
}

function ParticipantVideo({ track }: { track: Track }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <video
      autoPlay
      className="aspect-video w-full object-cover"
      muted
      playsInline
      ref={videoRef}
    />
  );
}

function ParticipantAudio({
  participantName,
  track,
}: {
  participantName: string;
  track: Track;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) {
      return;
    }
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    /* biome-ignore lint/a11y/useMediaCaption: Live audio has no pre-authored caption track. */
    <audio
      aria-label={`${participantName} audio`}
      autoPlay
      className="hidden"
      ref={audioRef}
    />
  );
}

export function ParticipantTile({ participant }: { participant: Participant }) {
  const videoTracks = participantTracks(participant, Track.Kind.Video);
  const audioTracks = participantTracks(participant, Track.Kind.Audio);
  const participantName = participant.name || participant.identity;

  return (
    <div className="zk-neon-surface min-w-0 overflow-hidden rounded-xl p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Users className="size-4" />
        <span className="truncate">{participantName}</span>
      </div>
      <div className="grid gap-2 overflow-hidden rounded-lg bg-black/50">
        {videoTracks.length ? (
          videoTracks.map((track) => (
            <ParticipantVideo key={track.sid} track={track} />
          ))
        ) : (
          <div className="text-muted-foreground flex aspect-video items-center justify-center text-xs">
            {participantName}
          </div>
        )}
        {audioTracks.map((track) => (
          <ParticipantAudio
            key={track.sid}
            participantName={participantName}
            track={track}
          />
        ))}
      </div>
    </div>
  );
}

export function LiveSessionConsole({
  lang,
  slug,
}: {
  lang: "ar" | "en";
  slug: string;
}) {
  const isArabic = lang === "ar";
  const [open, setOpen] = useState(false);
  const [quality, setQuality] = useState<QualityMode>("balanced");
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [availability, setAvailability] = useState<Availability>({
    status: "idle",
  });
  const [actionError, setActionError] = useState<string | null>(null);
  // Detected after mount, so the server render and the first client render agree.
  const [support, setSupport] = useState<MediaSupport | null>(null);
  useEffect(() => {
    setSupport(detectMediaSupport(navigator, window.isSecureContext));
  }, []);
  // Inside the ZOOKA-AI Android app, the app captures the screen natively for this room.
  const nativeBridgeRef = useRef<NativeScreenBridge | null>(null);
  const [nativeScreen, setNativeScreen] = useState(false);
  const [nativeScreenEnabled, setNativeScreenEnabled] = useState(false);
  useEffect(() => {
    const port = getNativePort(window as unknown as { ZookaNative?: unknown });
    if (!port) {
      return;
    }
    const bridge = createNativeScreenBridge(port, (message) => {
      if (message.type === "hello") {
        setNativeScreen(message.screen);
        return;
      }
      if (message.state === "started") {
        setNativeScreenEnabled(true);
        return;
      }
      setNativeScreenEnabled(false);
      if (message.state === "error") {
        setActionError(message.message ?? "screen_share_failed");
      }
    });
    nativeBridgeRef.current = bridge;
    bridge.hello();
    return () => {
      bridge.stop();
      bridge.dispose();
      nativeBridgeRef.current = null;
    };
  }, []);
  const useNativeScreen = nativeScreen && support !== null && !support.screen;
  const screenUnavailable = support !== null && !support.screen && !nativeScreen;
  const userMediaUnavailable = support !== null && (!support.camera || !support.microphone);
  const notice = support
    ? supportNotice(support, isArabic ? "ar" : "en", { nativeScreen })
    : null;
  const offerAndroidApp =
    support !== null && support.platform === "android" && !support.screen && !nativeScreen;
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const clientRef = useRef<LiveSessionClient | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  const stopStream = useCallback((stream: MediaStream | null) => {
    if (!stream) {
      return;
    }
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }, []);

  const stopLocalCapture = useCallback(() => {
    stopStream(cameraStreamRef.current);
    stopStream(microphoneStreamRef.current);
    stopStream(screenStreamRef.current);
    cameraStreamRef.current = null;
    microphoneStreamRef.current = null;
    screenStreamRef.current = null;
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
  }, [stopStream]);

  const releaseLocalCapture = useCallback(() => {
    stopLocalCapture();
    setMicEnabled(false);
    setCameraEnabled(false);
    setScreenEnabled(false);
  }, [stopLocalCapture]);

  const refreshPreview = useCallback(() => {
    const preview = previewRef.current;
    if (!preview) {
      return;
    }
    const tracks = [
      ...(cameraStreamRef.current?.getVideoTracks() ?? []),
      ...(microphoneStreamRef.current?.getAudioTracks() ?? []),
      ...(screenStreamRef.current?.getTracks() ?? []),
    ].filter((track) => track.readyState === "live");
    preview.srcObject = tracks.length ? new MediaStream(tracks) : null;
  }, []);

  const refreshParticipants = useCallback(() => {
    const room = clientRef.current?.room;
    setParticipants(room ? Array.from(room.remoteParticipants.values()) : []);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    setAvailability({ status: "loading" });
    setActionError(null);
    setConnected(false);
    setParticipants([]);
    setMicEnabled(false);
    setCameraEnabled(false);
    setScreenEnabled(false);

    const client = createLiveSessionClient();
    clientRef.current = client;
    const updateParticipants = () => {
      if (active) {
        refreshParticipants();
      }
    };
    const updateLocalTrackState = (publication: LocalTrackPublication) => {
      if (publication.source === Track.Source.Camera) {
        setCameraEnabled(false);
      }
      if (publication.source === Track.Source.Microphone) {
        setMicEnabled(false);
      }
      if (publication.source === Track.Source.ScreenShare) {
        setScreenEnabled(false);
      }
      updateParticipants();
    };
    const handleDisconnected = () => {
      if (!active) {
        return;
      }
      setConnected(false);
      setParticipants([]);
      releaseLocalCapture();
    };
    const updateConnectionState = (state: ConnectionState) => {
      if (active && state === ConnectionState.Disconnected) {
        handleDisconnected();
      }
    };
    client.room.on(RoomEvent.ParticipantConnected, updateParticipants);
    client.room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
    client.room.on(RoomEvent.TrackSubscribed, updateParticipants);
    client.room.on(RoomEvent.TrackUnsubscribed, updateParticipants);
    client.room.on(RoomEvent.TrackMuted, updateParticipants);
    client.room.on(RoomEvent.TrackUnmuted, updateParticipants);
    client.room.on(RoomEvent.LocalTrackUnpublished, updateLocalTrackState);
    client.room.on(RoomEvent.ConnectionStateChanged, updateConnectionState);
    client.room.on(RoomEvent.Disconnected, handleDisconnected);

    client
      .prepare(slug)
      .then((response) => {
        if (!active) {
          return;
        }
        setAvailability(
          response.configured
            ? { status: "ready" }
            : { status: "unavailable", reason: response.reason }
        );
      })
      .catch((error: unknown) => {
        if (active) {
          setAvailability({ status: "error", message: errorMessage(error) });
        }
      });

    return () => {
      active = false;
      client.room.off(RoomEvent.ParticipantConnected, updateParticipants);
      client.room.off(RoomEvent.ParticipantDisconnected, updateParticipants);
      client.room.off(RoomEvent.TrackSubscribed, updateParticipants);
      client.room.off(RoomEvent.TrackUnsubscribed, updateParticipants);
      client.room.off(RoomEvent.TrackMuted, updateParticipants);
      client.room.off(RoomEvent.TrackUnmuted, updateParticipants);
      client.room.off(RoomEvent.LocalTrackUnpublished, updateLocalTrackState);
      client.room.off(RoomEvent.ConnectionStateChanged, updateConnectionState);
      client.room.off(RoomEvent.Disconnected, handleDisconnected);
      if (clientRef.current === client) {
        clientRef.current = null;
      }
      stopLocalCapture();
      client.disconnect().catch(() => undefined);
    };
  }, [open, refreshParticipants, releaseLocalCapture, slug, stopLocalCapture]);

  const captureTrack = useCallback(
    async (kind: "audio" | "video") => {
      if (userMediaUnavailable) {
        throw new Error(
          kind === "video"
            ? isArabic
              ? "الكاميرا غير مدعومة في هذا المتصفح."
              : "Camera is not supported in this browser."
            : isArabic
              ? "الميكروفون غير مدعوم في هذا المتصفح."
              : "Microphone is not supported in this browser."
        );
      }
      const stream =
        kind === "video"
          ? await getUserMediaCompat(navigator, {
              video: videoConstraint(quality),
              audio: false,
            })
          : await getUserMediaCompat(navigator, {
              audio: true,
              video: false,
            });
      return {
        stream,
        track:
          kind === "video"
            ? stream.getVideoTracks()[0]
            : stream.getAudioTracks()[0],
      };
    },
    [isArabic, quality, userMediaUnavailable]
  );

  const toggleCamera = useCallback(async () => {
    setActionError(null);
    const client = clientRef.current;
    const track = cameraStreamRef.current?.getVideoTracks()[0];
    if (cameraEnabled && track) {
      try {
        if (connected && client) {
          await client.unpublishCamera(track);
        }
        stopStream(cameraStreamRef.current);
        cameraStreamRef.current = null;
        setCameraEnabled(false);
        refreshPreview();
      } catch (error) {
        setActionError(errorMessage(error));
      }
      return;
    }

    try {
      const capture = await captureTrack("video");
      if (!capture.track) {
        throw new Error(
          isArabic
            ? "لم يتم العثور على مسار كاميرا."
            : "No camera track was returned."
        );
      }
      cameraStreamRef.current = capture.stream;
      if (connected && client) {
        await client.publishCamera(capture.track);
      }
      setCameraEnabled(true);
      refreshPreview();
    } catch (error) {
      stopStream(cameraStreamRef.current);
      cameraStreamRef.current = null;
      setCameraEnabled(false);
      refreshPreview();
      setActionError(
        error instanceof Error && error.name === "NotAllowedError"
          ? isArabic
            ? "تعذّر الوصول إلى الكاميرا. تحقق من إذن الكاميرا لهذا الموقع في إعدادات المتصفح."
            : "Camera access was denied. Check the camera permission for this site in your browser."
          : errorMessage(error)
      );
    }
  }, [
    cameraEnabled,
    captureTrack,
    connected,
    isArabic,
    refreshPreview,
    stopStream,
  ]);

  const toggleMicrophone = useCallback(async () => {
    setActionError(null);
    const client = clientRef.current;
    const track = microphoneStreamRef.current?.getAudioTracks()[0];
    if (micEnabled && track) {
      try {
        if (connected && client) {
          await client.unpublishMicrophone(track);
        }
        stopStream(microphoneStreamRef.current);
        microphoneStreamRef.current = null;
        setMicEnabled(false);
        refreshPreview();
      } catch (error) {
        setActionError(errorMessage(error));
      }
      return;
    }

    try {
      const capture = await captureTrack("audio");
      if (!capture.track) {
        throw new Error(
          isArabic
            ? "لم يتم العثور على مسار ميكروفون."
            : "No microphone track was returned."
        );
      }
      microphoneStreamRef.current = capture.stream;
      if (connected && client) {
        await client.publishMicrophone(capture.track);
      }
      setMicEnabled(true);
      refreshPreview();
    } catch (error) {
      stopStream(microphoneStreamRef.current);
      microphoneStreamRef.current = null;
      setMicEnabled(false);
      refreshPreview();
      setActionError(errorMessage(error));
    }
  }, [
    captureTrack,
    connected,
    isArabic,
    micEnabled,
    refreshPreview,
    stopStream,
  ]);

  const toggleNativeScreenShare = useCallback(async () => {
    setActionError(null);
    const bridge = nativeBridgeRef.current;
    if (!bridge) {
      return;
    }
    if (nativeScreenEnabled) {
      bridge.stop();
      return;
    }
    try {
      // A fresh token for the app's own participant; the page's connection keeps its own.
      const response = await fetchLiveToken(slug);
      if (!response.configured) {
        setActionError(
          isArabic
            ? "الجلسة المباشرة غير مهيأة حاليًا."
            : "Live sessions are not configured right now."
        );
        return;
      }
      bridge.start(response.url, response.token);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }, [isArabic, nativeScreenEnabled, slug]);

  const toggleScreenShare = useCallback(async () => {
    setActionError(null);
    const client = clientRef.current;
    const track = screenStreamRef.current?.getVideoTracks()[0];
    if (screenEnabled && track) {
      try {
        if (connected && client) {
          await client.stopScreenShare(track);
        }
        stopStream(screenStreamRef.current);
        screenStreamRef.current = null;
        setScreenEnabled(false);
        refreshPreview();
      } catch (error) {
        setActionError(errorMessage(error));
      }
      return;
    }

    if (screenUnavailable) {
      // The button is disabled and the notice explains why; nothing to try here.
      return;
    }
    try {
      const stream = await getDisplayMediaCompat(navigator, {
        video: videoConstraint(quality),
        audio: false,
      });
      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) {
        throw new Error(
          isArabic
            ? "لم يتم العثور على مسار شاشة."
            : "No screen track was returned."
        );
      }
      screenTrack.onended = () => {
        screenStreamRef.current = null;
        setScreenEnabled(false);
        refreshPreview();
      };
      screenStreamRef.current = stream;
      if (connected && client) {
        await client.startScreenShare(screenTrack);
      }
      setScreenEnabled(true);
      refreshPreview();
    } catch (error) {
      stopStream(screenStreamRef.current);
      screenStreamRef.current = null;
      setScreenEnabled(false);
      refreshPreview();
      const name = error instanceof Error ? error.name : "";
      setActionError(
        name === "NotAllowedError" || name === "AbortError"
          ? isArabic
            ? "تم رفض مشاركة الشاشة أو إلغاؤها."
            : "Screen sharing was denied or canceled."
          : errorMessage(error)
      );
    }
  }, [connected, isArabic, quality, refreshPreview, screenEnabled, screenUnavailable, stopStream]);

  const joinRoom = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      return;
    }
    setConnecting(true);
    setActionError(null);
    try {
      await client.connect(slug);
      const publications: Promise<unknown>[] = [];
      const cameraTrack = cameraStreamRef.current?.getVideoTracks()[0];
      const microphoneTrack = microphoneStreamRef.current?.getAudioTracks()[0];
      const screenTrack = screenStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        publications.push(client.publishCamera(cameraTrack));
      }
      if (microphoneTrack) {
        publications.push(client.publishMicrophone(microphoneTrack));
      }
      if (screenTrack) {
        publications.push(client.startScreenShare(screenTrack));
      }
      await Promise.all(publications);
      setConnected(true);
      refreshParticipants();
    } catch (error) {
      await client.disconnect().catch(() => undefined);
      releaseLocalCapture();
      setAvailability({ status: "error", message: errorMessage(error) });
    } finally {
      setConnecting(false);
    }
  }, [refreshParticipants, releaseLocalCapture, slug]);

  const disconnectRoom = useCallback(async () => {
    const client = clientRef.current;
    if (client) {
      try {
        await client.disconnect();
        setAvailability({ status: "ready" });
      } catch (error) {
        setAvailability({ status: "error", message: errorMessage(error) });
      }
    }
    setConnected(false);
    setParticipants([]);
    releaseLocalCapture();
  }, [releaseLocalCapture]);

  const isSessionLive = cameraEnabled || micEnabled || screenEnabled || nativeScreenEnabled;
  const summary = useMemo(() => {
    const tracks: string[] = [];
    if (micEnabled) {
      tracks.push(isArabic ? "صوت" : "Audio");
    }
    if (cameraEnabled) {
      tracks.push(isArabic ? "كاميرا" : "Camera");
    }
    if (screenEnabled || nativeScreenEnabled) {
      tracks.push(isArabic ? "شاشة" : "Screen");
    }
    return tracks.join(" + ");
  }, [cameraEnabled, isArabic, micEnabled, nativeScreenEnabled, screenEnabled]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={isArabic ? "الجلسة المباشرة" : "Live session"}
            aria-pressed={connected}
            className="size-8 rounded-full p-0"
            onClick={() => setOpen(true)}
            title={isArabic ? "الجلسة المباشرة" : "Live session"}
            type="button"
            variant={connected ? "default" : "ghost"}
          >
            <Radio className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isArabic ? "جلسة مباشرة" : "Live session"}
        </TooltipContent>
      </Tooltip>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="zk-neon-surface max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {isArabic ? "الجلسة المباشرة" : "Live session"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <LiveSessionStatus
              availability={availability}
              connecting={connecting}
              lang={lang}
              onJoin={joinRoom}
            />

            {connected && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-emerald-300" role="status">
                  {isArabic ? "متصل بالغرفة" : "Connected to the room"}
                </p>
                <Button
                  onClick={disconnectRoom}
                  type="button"
                  variant="outline"
                >
                  <LogOut className="size-4" />
                  {isArabic ? "مغادرة الجلسة" : "Leave session"}
                </Button>
              </div>
            )}

            <div className="zk-neon-surface rounded-xl p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-1 font-medium">
                  <Users className="size-4" />
                  {isArabic ? "التقاط محلي" : "Local capture"}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    isSessionLive
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isSessionLive
                    ? isArabic
                      ? "مفعّل"
                      : "On"
                    : isArabic
                      ? "متوقف"
                      : "Off"}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                {connected
                  ? summary
                    ? `${isArabic ? "المسارات المنشورة" : "Published tracks"}: ${summary}`
                    : isArabic
                      ? "لا توجد مسارات منشورة."
                      : "No tracks are published."
                  : summary ||
                    (isArabic
                      ? "لا توجد قنوات مفعلة بعد."
                      : "No active channels yet.")}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button
                aria-pressed={micEnabled}
                disabled={connecting || userMediaUnavailable}
                onClick={toggleMicrophone}
                type="button"
                variant={micEnabled ? "default" : "outline"}
              >
                <Mic className="size-4" />
                {isArabic ? "صوت" : "Mic"}
              </Button>
              <Button
                aria-pressed={cameraEnabled}
                disabled={connecting || userMediaUnavailable}
                onClick={toggleCamera}
                type="button"
                variant={cameraEnabled ? "default" : "outline"}
              >
                <Camera className="size-4" />
                {isArabic ? "كاميرا" : "Camera"}
              </Button>
              <Button
                aria-describedby={notice ? "live-media-support" : undefined}
                aria-pressed={useNativeScreen ? nativeScreenEnabled : screenEnabled}
                data-testid="live-screen-button"
                disabled={connecting || screenUnavailable}
                onClick={useNativeScreen ? toggleNativeScreenShare : toggleScreenShare}
                title={screenUnavailable && notice ? notice : undefined}
                type="button"
                variant={
                  (useNativeScreen ? nativeScreenEnabled : screenEnabled)
                    ? "default"
                    : "outline"
                }
              >
                <MonitorUp className="size-4" />
                {isArabic ? "شاشة" : "Screen"}
              </Button>
            </div>

            {notice && (
              <p
                className="text-muted-foreground text-xs"
                data-testid="live-media-support"
                id="live-media-support"
                role="status"
              >
                {notice}
              </p>
            )}

            {offerAndroidApp && (
              <a
                className="text-primary text-xs underline underline-offset-4"
                data-testid="live-android-app"
                href={ANDROID_APP_URL}
                rel="noopener"
              >
                {isArabic
                  ? "تحميل تطبيق ZOOKA-AI لأندرويد (مشاركة شاشة الجوال)"
                  : "Download the ZOOKA-AI Android app (share your phone screen)"}
              </a>
            )}

            {actionError && (
              <p className="text-destructive text-xs" role="alert">
                {actionError}
              </p>
            )}

            <div className="zk-neon-surface rounded-xl p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Settings2 className="size-4" />
                {isArabic ? "جودة المعاينة" : "Preview quality"}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["performance", "balanced", "high"] as QualityMode[]).map(
                  (mode) => (
                    <Button
                      key={mode}
                      onClick={() => setQuality(mode)}
                      type="button"
                      variant={quality === mode ? "default" : "outline"}
                    >
                      {qualityLabel(mode, lang)}
                    </Button>
                  )
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="zk-neon-surface min-w-0 overflow-hidden rounded-xl p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Users className="size-4" />
                  <span>{isArabic ? "أنت" : "You"}</span>
                  {connected && (
                    <span className="text-muted-foreground text-xs">
                      {clientRef.current?.room.localParticipant.name ||
                        clientRef.current?.room.localParticipant.identity}
                    </span>
                  )}
                </div>
                <div className="overflow-hidden rounded-lg bg-black/50">
                  <video
                    autoPlay
                    className="aspect-video w-full object-cover"
                    muted
                    playsInline
                    ref={previewRef}
                  />
                </div>
              </div>
              {participants.map((participant) => (
                <ParticipantTile
                  key={participant.identity}
                  participant={participant}
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
