"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type RecorderState = "idle" | "recording" | "transcribing";

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function VoiceInputButton({
  lang,
  disabled,
  onTranscript,
}: {
  lang: "ar" | "en";
  disabled?: boolean;
  onTranscript: (text: string) => void;
}) {
  const isArabic = lang === "ar";
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const discardRef = useRef(false);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (state !== "recording") {
      return;
    }
    setSeconds(0);
    const timer = window.setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => releaseStream, [releaseStream]);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setState("transcribing");
      try {
        const form = new FormData();
        const extension = blob.type.includes("mp4") ? "mp4" : "webm";
        form.append("audio", blob, `voice.${extension}`);
        form.append("lang", lang);
        const response = await fetch("/api/voice/transcribe", {
          method: "POST",
          body: form,
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          const reason = payload?.error ?? `HTTP ${response.status}`;
          toast.error(
            isArabic
              ? `تعذّر تحويل الصوت إلى نص (${reason}).`
              : `Could not transcribe the audio (${reason}).`
          );
          return;
        }
        const data = (await response.json()) as { text?: string };
        const text = (data.text ?? "").trim();
        if (!text) {
          toast.error(
            isArabic
              ? "لم أسمع كلامًا واضحًا، جرّب مرة أخرى."
              : "I could not hear clear speech, please try again."
          );
          return;
        }
        onTranscript(text);
      } catch (error) {
        console.error("voice transcription failed", error);
        toast.error(
          isArabic ? "فشل إرسال الصوت للتحويل." : "Sending audio failed."
        );
      } finally {
        setState("idle");
      }
    },
    [isArabic, lang, onTranscript]
  );

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      toast.error(
        isArabic
          ? "المتصفح لا يدعم التسجيل الصوتي."
          : "This browser cannot record audio."
      );
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      toast.error(
        isArabic
          ? "المتصفح لا يدعم تسجيل الصوت."
          : "Recording is not supported here."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      discardRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        releaseStream();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        if (discardRef.current) {
          setState("idle");
          return;
        }
        if (blob.size < 1200) {
          setState("idle");
          toast.error(
            isArabic ? "التسجيل قصير جدًا." : "That recording was too short."
          );
          return;
        }
        void transcribe(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch (error) {
      releaseStream();
      setState("idle");
      console.error("microphone error", error);
      toast.error(
        isArabic
          ? "محتاج إذن الميكروفون من إعدادات المتصفح."
          : "Microphone permission is required."
      );
    }
  }, [isArabic, releaseStream, transcribe]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    stop();
  }, [stop]);

  if (state === "transcribing") {
    return (
      <Button
        aria-label={isArabic ? "جارٍ تحويل الصوت" : "Transcribing"}
        className="h-8 px-2 text-muted-foreground"
        disabled
        size="sm"
        type="button"
        variant="ghost"
      >
        <Loader2 className="size-4 animate-spin" />
      </Button>
    );
  }

  if (state === "recording") {
    return (
      <span className="flex items-center gap-1">
        <Button
          aria-label={isArabic ? "إيقاف التسجيل" : "Stop recording"}
          className="h-8 px-2 text-red-600"
          data-testid="voice-stop-button"
          onClick={stop}
          size="sm"
          title={
            isArabic ? "إيقاف وإرسال التسجيل" : "Stop and send the recording"
          }
          type="button"
          variant="ghost"
        >
          <Square className="size-3.5 fill-current" />
          <span className="ml-1 text-xs tabular-nums">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </span>
        </Button>
        <Button
          aria-label={isArabic ? "إلغاء" : "Cancel"}
          className="h-8 px-2 text-muted-foreground text-xs"
          onClick={cancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          {isArabic ? "إلغاء" : "Cancel"}
        </Button>
      </span>
    );
  }

  return (
    <Button
      aria-label={isArabic ? "تسجيل صوتي" : "Record a voice message"}
      className="h-8 px-2"
      data-testid="voice-record-button"
      disabled={disabled}
      onClick={() => void start()}
      size="sm"
      title={
        isArabic
          ? "اضغط وتكلّم، واضغط مرة أخرى للإرسال"
          : "Tap, speak, then tap again to send"
      }
      type="button"
      variant="ghost"
    >
      <Mic className="size-4" />
    </Button>
  );
}
