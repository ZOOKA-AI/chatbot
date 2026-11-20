"use client";

import { Camera, Mic, MonitorUp, Radio, Settings2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type QualityMode = "balanced" | "performance" | "high";

function videoConstraint(mode: QualityMode): MediaTrackConstraints {
  if (mode === "performance") {
    return { width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } };
  }
  if (mode === "high") {
    return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } };
  }
  return { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };
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

export function LiveSessionConsole({ lang }: { lang: "ar" | "en" }) {
  const isArabic = lang === "ar";
  const [open, setOpen] = useState(false);
  const [quality, setQuality] = useState<QualityMode>("balanced");
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);

  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  const stopStream = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const refreshPreview = useCallback(() => {
    const preview = previewRef.current;
    if (!preview) {
      return;
    }
    const stream = screenStreamRef.current ?? cameraStreamRef.current;
    if (preview.srcObject === stream) {
      return;
    }
    preview.srcObject = stream;
  }, []);

  const enableCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error(isArabic ? "الكاميرا غير مدعومة في هذا المتصفح." : "Camera is not supported in this browser.");
      return;
    }
    try {
      stopStream(cameraStreamRef.current);
      cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint(quality),
        audio: micEnabled,
      });
      setCameraEnabled(true);
      refreshPreview();
    } catch {
      setCameraEnabled(false);
      toast.error(isArabic ? "تعذر تشغيل الكاميرا." : "Unable to start camera.");
    }
  }, [isArabic, micEnabled, quality, refreshPreview, stopStream]);

  const disableCamera = useCallback(() => {
    stopStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    setCameraEnabled(false);
    refreshPreview();
  }, [refreshPreview, stopStream]);

  const enableMic = useCallback(async () => {
    if (cameraEnabled) {
      cameraStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      setMicEnabled(true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error(isArabic ? "الميكروفون غير مدعوم في هذا المتصفح." : "Microphone is not supported in this browser.");
      return;
    }
    try {
      stopStream(cameraStreamRef.current);
      cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      setMicEnabled(true);
      refreshPreview();
    } catch {
      setMicEnabled(false);
      toast.error(isArabic ? "تعذر تشغيل الميكروفون." : "Unable to start microphone.");
    }
  }, [cameraEnabled, isArabic, refreshPreview, stopStream]);

  const disableMic = useCallback(() => {
    if (cameraEnabled) {
      cameraStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      setMicEnabled(false);
      return;
    }
    stopStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    setMicEnabled(false);
    refreshPreview();
  }, [cameraEnabled, refreshPreview, stopStream]);

  const enableScreen = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error(isArabic ? "مشاركة الشاشة غير مدعومة." : "Screen sharing is not supported.");
      return;
    }
    try {
      stopStream(screenStreamRef.current);
      screenStreamRef.current = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraint(quality),
        audio: true,
      });
      screenStreamRef.current.getVideoTracks().forEach((track) => {
        track.onended = () => {
          stopStream(screenStreamRef.current);
          screenStreamRef.current = null;
          setScreenEnabled(false);
          refreshPreview();
        };
      });
      setScreenEnabled(true);
      refreshPreview();
    } catch {
      setScreenEnabled(false);
      toast.error(isArabic ? "تم إلغاء مشاركة الشاشة." : "Screen share was canceled.");
    }
  }, [isArabic, quality, refreshPreview, stopStream]);

  const disableScreen = useCallback(() => {
    stopStream(screenStreamRef.current);
    screenStreamRef.current = null;
    setScreenEnabled(false);
    refreshPreview();
  }, [refreshPreview, stopStream]);

  useEffect(() => {
    refreshPreview();
  }, [cameraEnabled, screenEnabled, refreshPreview]);

  useEffect(() => {
    return () => {
      stopStream(cameraStreamRef.current);
      stopStream(screenStreamRef.current);
    };
  }, [stopStream]);

  const isSessionLive = cameraEnabled || micEnabled || screenEnabled;
  const summary = useMemo(() => {
    const tracks: string[] = [];
    if (micEnabled) tracks.push(isArabic ? "صوت" : "Audio");
    if (cameraEnabled) tracks.push(isArabic ? "كاميرا" : "Camera");
    if (screenEnabled) tracks.push(isArabic ? "شاشة" : "Screen");
    return tracks.join(" + ");
  }, [cameraEnabled, isArabic, micEnabled, screenEnabled]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={isArabic ? "جلسة مباشرة" : "Live session controls"}
            aria-pressed={isSessionLive}
            className="size-8 rounded-full p-0"
            onClick={() => setOpen(true)}
            title={isArabic ? "الصوت/الكاميرا/الشاشة" : "Audio/Camera/Screen"}
            type="button"
            variant={isSessionLive ? "default" : "ghost"}
          >
            <Radio className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isArabic ? "جلسة مباشرة" : "Live session"}
        </TooltipContent>
      </Tooltip>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="zk-neon-surface max-w-xl">
          <DialogHeader>
            <DialogTitle>{isArabic ? "جلسة تواصل مباشرة" : "Live communication session"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="zk-neon-surface rounded-xl p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-1 font-medium">
                  <Users className="size-4" />
                  {isArabic ? "الحضور" : "Presence"}
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs", isSessionLive ? "bg-emerald-500/20 text-emerald-300" : "bg-muted text-muted-foreground")}>
                  {isSessionLive ? (isArabic ? "مباشر" : "Live") : isArabic ? "جاهز" : "Ready"}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">{summary || (isArabic ? "لا توجد قنوات مفعلة بعد." : "No active channels yet.")}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button
                onClick={() => (micEnabled ? disableMic() : void enableMic())}
                type="button"
                variant={micEnabled ? "default" : "outline"}
              >
                <Mic className="size-4" />
                {isArabic ? "صوت" : "Mic"}
              </Button>
              <Button
                onClick={() => (cameraEnabled ? disableCamera() : void enableCamera())}
                type="button"
                variant={cameraEnabled ? "default" : "outline"}
              >
                <Camera className="size-4" />
                {isArabic ? "كاميرا" : "Camera"}
              </Button>
              <Button
                onClick={() => (screenEnabled ? disableScreen() : void enableScreen())}
                type="button"
                variant={screenEnabled ? "default" : "outline"}
              >
                <MonitorUp className="size-4" />
                {isArabic ? "شاشة" : "Screen"}
              </Button>
            </div>

            <div className="zk-neon-surface rounded-xl p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Settings2 className="size-4" />
                {isArabic ? "وضع الجودة" : "Stream quality"}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["performance", "balanced", "high"] as QualityMode[]).map((mode) => (
                  <Button
                    key={mode}
                    onClick={() => setQuality(mode)}
                    type="button"
                    variant={quality === mode ? "default" : "outline"}
                  >
                    {qualityLabel(mode, lang)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/70 bg-black/40">
              <video
                autoPlay
                className="aspect-video w-full object-cover"
                muted
                playsInline
                ref={previewRef}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
