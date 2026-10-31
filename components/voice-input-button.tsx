"use client";

import { Loader2, Mic, Square } from "lucide-react";
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
  onresult: ((event: { resultIndex: number; results: SpeechResultLike[] }) => void) | null;
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
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const discardRef = useRef(false);
  const fallbackRef = useRef(false);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (state === "idle" || state === "transcribing") {
      return;
    }
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => releaseStream, [releaseStream]);

  const finish = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        toast.error(
          isArabic
            ? "لم أسمع كلامًا واضحًا، جرّب مرة أخرى."
            : "I could not hear clear speech, please try again."
        );
        return;
      }
      onTranscript(trimmed);
    },
    [isArabic, onTranscript]
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
          toast.error(
            isArabic
              ? `تعذّر تحويل التسجيل إلى نص (${payload?.error ?? response.status}). جرّب متصفح Chrome أو اكتب الرسالة.`
              : `Could not transcribe the recording (${payload?.error ?? response.status}). Try Chrome or type instead.`
          );
          return;
        }
        const data = (await response.json()) as { text?: string };
        finish(data.text ?? "");
      } catch (error) {
        console.error("voice transcription failed", error);
        toast.error(
          isArabic ? "فشل إرسال الصوت للتحويل." : "Sending audio failed."
        );
      } finally {
        setState("idle");
      }
    },
    [finish, isArabic, lang]
  );

  const startRecorderFallback = useCallback(async () => {
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
        void transcribeServerSide(blob);
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
  }, [isArabic, releaseStream, transcribeServerSide]);

  const startListening = useCallback(() => {
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
      setLive("");
      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) {
            transcriptRef.current = `${transcriptRef.current} ${text}`.trim();
          } else {
            interim = `${interim} ${text}`.trim();
          }
        }
        setLive(interim);
      };
      recognition.onerror = (event) => {
        if (event.error === "network") {
          fallbackRef.current = true;
        }
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          toast.error(
            isArabic
              ? "محتاج إذن الميكروفون من إعدادات المتصفح."
              : "Microphone permission is required."
          );
        } else if (event.error !== "aborted" && event.error !== "no-speech") {
          console.warn("speech recognition error", event.error);
        }
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setLive("");
        const heard = transcriptRef.current.trim();
        const shouldFallBack = fallbackRef.current && !heard;
        fallbackRef.current = false;
        transcriptRef.current = "";
        if (shouldFallBack) {
          setState("idle");
          void startRecorderFallback();
          return;
        }
        setState("idle");
        finish(heard);
      };
      recognitionRef.current = recognition;
      recognition.start();
      setState("listening");
    } catch (error) {
      console.warn("speech recognition unavailable, falling back", error);
      void startRecorderFallback();
    }
  }, [finish, isArabic, lang, startRecorderFallback]);

  const stopEverything = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
      transcriptRef.current = "";
      setLive("");
      setState("idle");
      return;
    }
    stopEverything();
  }, [stopEverything]);

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
      <span className="flex items-center gap-1">
        <Button
          aria-label={isArabic ? "إيقاف التسجيل" : "Stop recording"}
          className="h-8 max-w-[11rem] px-2 text-red-600"
          data-testid="voice-stop-button"
          onClick={stopEverything}
          size="sm"
          title={
            isArabic ? "إيقاف وإرسال التسجيل" : "Stop and send the recording"
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
    );
  }

  return (
    <Button
      aria-label={isArabic ? "التحدث إلى الوكيل" : "Talk to the agent"}
      className="h-8 px-2"
      data-testid="voice-record-button"
      disabled={disabled}
      onClick={startListening}
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
