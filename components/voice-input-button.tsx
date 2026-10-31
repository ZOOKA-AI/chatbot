"use client";

import { AlertTriangle, Loader2, Mic, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type RecorderState = "idle" | "listening" | "recording" | "transcribing";

type SpeechResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((event: { resultIndex: number; results: SpeechResultLike[] }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const scoped = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scoped.SpeechRecognition ?? scoped.webkitSpeechRecognition ?? null;
}

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

type VoiceError = "permission" | "no_speech" | "not_supported" | "failed";

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
  const [live, setLive] = useState("");
  const [error, setError] = useState<VoiceError | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const discardRef = useRef(false);
  const heardRef = useRef(false);
  const watchdogRef = useRef<number | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearWatchdog();
    releaseStream();
    setState("idle");
    setLive("");
    setSeconds(0);
  }, [clearWatchdog, releaseStream]);

  useEffect(() => {
    if (state === "idle" || state === "transcribing") {
      return;
    }
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  // Nothing may stay "recording" for ever: hard stop at 60s.
  useEffect(() => {
    if (state !== "listening" && state !== "recording") {
      return;
    }
    const limit = window.setTimeout(() => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      if (!heardRef.current) {
        reset();
      }
    }, 60_000);
    return () => window.clearTimeout(limit);
  }, [state, reset]);

  useEffect(
    () => () => {
      clearWatchdog();
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        discardRef.current = true;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [clearWatchdog]
  );

  const finish = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setError("no_speech");
        return;
      }
      setError(null);
      onTranscript(trimmed);
    },
    [onTranscript]
  );

  const transcribeServerSide = useCallback(
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
          setError("failed");
          console.warn("transcription refused", payload?.error, response.status);
          return;
        }
        const data = (await response.json()) as { text?: string };
        finish(data.text ?? "");
      } catch (err) {
        console.error("voice transcription failed", err);
        setError("failed");
      } finally {
        setState("idle");
      }
    },
    [finish, lang]
  );

  const startRecorderFallback = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setError("not_supported");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("not_supported");
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
          reset();
          return;
        }
        if (blob.size < 1200) {
          reset();
          setError("no_speech");
          return;
        }
        void transcribeServerSide(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch (err) {
      releaseStream();
      reset();
      const name = (err as { name?: string } | null)?.name;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "permission"
          : "failed"
      );
    }
  }, [releaseStream, reset, transcribeServerSide]);

  const startListening = useCallback(async () => {
    setError(null);
    // Ask the browser first: a denied permission must produce a clear message,
    // never a red button that keeps counting.
    try {
      if (navigator?.permissions?.query) {
        const status = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (status.state === "denied") {
          setError("permission");
          return;
        }
      }
    } catch {
      // Permission API without microphone support: continue and let start() decide.
    }

    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      void startRecorderFallback();
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = lang === "ar" ? "ar-SA" : "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      transcriptRef.current = "";
      heardRef.current = false;
      setLive("");

      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) {
            transcriptRef.current = `${transcriptRef.current} ${text}`.trim();
            if (transcriptRef.current) {
              heardRef.current = true;
            }
          } else {
            interim = `${interim} ${text}`.trim();
            if (interim) {
              heardRef.current = true;
            }
          }
        }
        setLive(interim);
      };

      recognition.onerror = (event) => {
        recognitionRef.current = null;
        clearWatchdog();
        const code = event.error;
        if (code === "not-allowed" || code === "service-not-allowed") {
          reset();
          setError("permission");
          return;
        }
        if (code === "no-speech" || code === "aborted") {
          reset();
          setError(code === "aborted" ? null : "no_speech");
          return;
        }
        // Network / audio-capture problems: try the recorder path instead.
        reset();
        void startRecorderFallback();
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        clearWatchdog();
        const heard = transcriptRef.current.trim();
        transcriptRef.current = "";
        setLive("");
        setState("idle");
        if (heard) {
          finish(heard);
        } else if (!discardRef.current) {
          setError((current) => current ?? "no_speech");
        }
        discardRef.current = false;
      };

      recognitionRef.current = recognition;
      recognition.start();
      setState("listening");

      // If the engine never says anything for 12s, close it instead of hanging.
      clearWatchdog();
      watchdogRef.current = window.setTimeout(() => {
        if (!heardRef.current && recognitionRef.current) {
          recognitionRef.current.stop();
        }
      }, 12_000);
    } catch (err) {
      console.warn("speech recognition unavailable, using recorder", err);
      reset();
      void startRecorderFallback();
    }
  }, [
    clearWatchdog,
    finish,
    lang,
    reset,
    startRecorderFallback,
  ]);

  const stopEverything = useCallback(() => {
    clearWatchdog();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, [clearWatchdog]);

  const cancel = useCallback(() => {
    discardRef.current = true;
    clearWatchdog();
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
      transcriptRef.current = "";
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    reset();
  }, [clearWatchdog, reset]);

  const errorPanel = error ? (
    <div className="fixed inset-x-2 bottom-24 z-50 mx-auto max-w-md rounded-xl border border-amber-500/40 bg-background p-3 shadow-xl">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0 grow space-y-1.5">
          <p className="text-sm font-medium">
            {error === "permission"
              ? isArabic
                ? "المتصفح رافض إذن الميكروفون"
                : "The browser is blocking the microphone"
              : error === "not_supported"
                ? isArabic
                  ? "المتصفح لا يدعم التسجيل الصوتي"
                  : "This browser cannot record audio"
                : error === "no_speech"
                  ? isArabic
                    ? "لم أسمع كلامًا واضحًا"
                    : "I could not hear clear speech"
                  : isArabic
                    ? "تعذّر تحويل الصوت إلى نص"
                    : "Could not transcribe the audio"}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {error === "permission"
              ? isArabic
                ? "من نفس المتصفح: اضغط أيقونة القفل أو ⓘ جنب العنوان ← الأذونات ← الميكروفون ← السماح، ثم أعد تحميل الصفحة. وافتح zooka-ai.com في Chrome وليس داخل متصفح واتساب."
                : "In the same browser: tap the lock icon next to the address, allow Microphone, then reload. Open zooka-ai.com in Chrome, not inside the WhatsApp browser."
              : isArabic
                ? "تأكد إن الميكروفون مش مستخدم في تطبيق تاني، وقرّب الموبايل من فمك وجرّب تاني."
                : "Make sure no other app is using the microphone, then try again."}
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              className="h-8 text-xs"
              onClick={() => {
                setError(null);
                void startListening();
              }}
              size="sm"
              type="button"
            >
              {isArabic ? "إعادة المحاولة" : "Try again"}
            </Button>
            <Button
              className="h-8 text-xs"
              onClick={() => setError(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isArabic ? "إغلاق" : "Close"}
            </Button>
          </div>
        </div>
        <button
          aria-label={isArabic ? "إغلاق" : "Close"}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setError(null)}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  ) : null;

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

  if (state === "listening" || state === "recording") {
    return (
      <>
        {errorPanel}
        <span className="flex items-center gap-1">
          <Button
            aria-label={isArabic ? "إيقاف التسجيل" : "Stop recording"}
            className="h-8 max-w-[11rem] px-2 text-red-600"
            data-testid="voice-stop-button"
            onClick={stopEverything}
            size="sm"
            title={
              isArabic
                ? "إيقاف وإرسال التسجيل"
                : "Stop and send the recording"
            }
            type="button"
            variant="ghost"
          >
            <Square className="size-3.5 fill-current" />
            <span className="ml-1 truncate text-xs tabular-nums">
              {live
                ? live.slice(-40)
                : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
                    seconds % 60
                  ).padStart(2, "0")}`}
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
      </>
    );
  }

  return (
    <>
      {errorPanel}
      <Button
        aria-label={isArabic ? "التحدث إلى الوكيل" : "Talk to the agent"}
        className="h-8 px-2"
        data-testid="voice-record-button"
        disabled={disabled}
        onClick={() => {
          void startListening();
        }}
        size="sm"
        title={
          isArabic
            ? "اضغط وتكلّم، واضغط المربع الأحمر للإرسال"
            : "Tap, speak, then tap the red square to send"
        }
        type="button"
        variant="ghost"
      >
        <Mic className="size-4" />
      </Button>
    </>
  );
}
