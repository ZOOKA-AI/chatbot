"use client";
import { Download, Monitor, Pause, Play, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  MAX_RECORDING_BYTES,
  MAX_RECORDING_MS,
  mediaError,
  recordingMime,
} from "@/lib/studio-media";
import styles from "./studio.module.css";

export function ScreenRecorder() {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<
    "idle" | "choosing" | "recording" | "paused" | "stopping"
  >("idle");
  const [url, setUrl] = useState("");
  const [mime, setMime] = useState("");
  const [message, setMessage] = useState("");
  const [audio, setAudio] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [bytes, setBytes] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const size = useRef(0);
  const active = useRef(true);
  const starting = useRef(false);
  const blobUrl = useRef("");
  const discard = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupStream = () => {
    stream.current?.getTracks().forEach((t) => {
      t.stop();
    });
    stream.current = null;
  };
  const stop = () => {
    if (recorder.current && recorder.current.state !== "inactive") {
      setState("stopping");
      recorder.current.stop();
    }
    cleanupStream();
  };
  useEffect(() => {
    active.current = true;
    setSupported(
      window.isSecureContext &&
        !!navigator.mediaDevices?.getDisplayMedia &&
        typeof MediaRecorder !== "undefined",
    );
    return () => {
      active.current = false;
      discard.current = true;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      cleanupStream();
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, []);
  useEffect(() => {
    if (state !== "recording" && state !== "paused") return;
    const interval = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(interval);
  }, [state]);
  const start = async () => {
    if (starting.current || state !== "idle") return;
    if (url && !window.confirm("سيُستبدل التسجيل السابق. هل نزّلت نسختك؟"))
      return;
    starting.current = true;
    setState("choosing");
    setMessage("");
    discard.current = false;
    try {
      const capture = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio,
      });
      if (!active.current) {
        capture.getTracks().forEach((t) => {
          t.stop();
        });
        return;
      }
      stream.current = capture;
      const type = recordingMime((m) => MediaRecorder.isTypeSupported(m));
      const next = type
        ? new MediaRecorder(capture, { mimeType: type })
        : new MediaRecorder(capture);
      recorder.current = next;
      chunks.current = [];
      size.current = 0;
      setBytes(0);
      setSeconds(0);
      next.ondataavailable = (event) => {
        if (discard.current || !event.data.size) return;
        chunks.current.push(event.data);
        size.current += event.data.size;
        if (active.current) setBytes(size.current);
        if (size.current >= MAX_RECORDING_BYTES && next.state !== "inactive") {
          setMessage(
            "وصل التسجيل إلى حد الحجم؛ أُوقف تلقائياً لحماية ذاكرة المتصفح.",
          );
          stop();
        }
      };
      next.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        cleanupStream();
        if (!active.current || discard.current) {
          chunks.current = [];
          return;
        }
        const blob = new Blob(chunks.current, {
          type: next.mimeType || type || "video/webm",
        });
        chunks.current = [];
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = blob.size ? URL.createObjectURL(blob) : "";
        setUrl(blobUrl.current);
        setMime(blob.type);
        setState("idle");
        if (!blob.size) setMessage("لم ينتج التسجيل ملفاً قابلاً للتنزيل.");
      };
      next.onerror = () => {
        setMessage("واجه المسجّل خطأ. أوقف التسجيل وراجع الملف الناتج إن وُجد.");
        stop();
      };
      capture
        .getVideoTracks()[0]
        ?.addEventListener("ended", stop, { once: true });
      next.start(1000);
      setState("recording");
      setMessage(
        audio && capture.getAudioTracks().length === 0
          ? "بدأ التسجيل دون صوت؛ المصدر أو المتصفح لم يوفّر مسار صوت."
          : "بدأ تسجيل المصدر الذي اخترته. لا يُرفع الملف إلى خادم Zooka.",
      );
      timer.current = setTimeout(() => {
        if (active.current) {
          setMessage("انتهى الحد الزمني: 3 دقائق، شاملاً وقت الإيقاف المؤقت.");
          stop();
        }
      }, MAX_RECORDING_MS);
    } catch (error) {
      cleanupStream();
      if (active.current) {
        setState("idle");
        setMessage(mediaError(error));
      }
    } finally {
      starting.current = false;
    }
  };
  const togglePause = () => {
    if (recorder.current?.state === "recording") {
      recorder.current.pause();
      setState("paused");
    } else if (recorder.current?.state === "paused") {
      recorder.current.resume();
      setState("recording");
    }
  };
  const remove = () => {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = "";
    setUrl("");
    setBytes(0);
    setSeconds(0);
    setMessage("حُذف التسجيل من ذاكرة هذه الصفحة.");
  };
  return (
    <section aria-label="تسجيل الشاشة" className={styles.mediaCard}>
      <h2>
        <Monitor size={22} /> تسجيل الشاشة
      </h2>
      <p>
        اختر تبويباً أو نافذة من حوار المتصفح. لا يبدأ التسجيل دون إذنك، ولا
        يشاهد الوكيل الشاشة. الملف محلي مؤقت، بحد 3 دقائق ونحو 50 ميجابايت (قد
        يتجاوز الحد بآخر جزء).
      </p>
      <label className={styles.mediaCheck}>
        <input
          checked={audio}
          disabled={state !== "idle"}
          onChange={(e) => setAudio(e.target.checked)}
          type="checkbox"
        />{" "}
        طلب صوت المصدر إن دعمه المتصفح — ليس الميكروفون
      </label>
      {!supported && (
        <p className={styles.muted}>
          المتصفح لا يوفّر تسجيل الشاشة هنا. جرّب Chrome أو Edge على الكمبيوتر
          وHTTPS؛ دعم الجوال متفاوت.
        </p>
      )}
      <div className={styles.transferActions}>
        <button
          className={styles.primary}
          disabled={!supported || state !== "idle"}
          onClick={() => void start()}
          type="button"
        >
          <Monitor size={16} />
          {state === "choosing"
            ? "اختر المصدر في المتصفح…"
            : "ابدأ تسجيل الشاشة"}
        </button>
        <button
          className={styles.secondary}
          disabled={state !== "recording" && state !== "paused"}
          onClick={togglePause}
          type="button"
        >
          {state === "paused" ? <Play size={16} /> : <Pause size={16} />}
          {state === "paused" ? "استئناف" : "إيقاف مؤقت"}
        </button>
        <button
          className={styles.secondary}
          disabled={state !== "recording" && state !== "paused"}
          onClick={stop}
          type="button"
        >
          <Square size={16} /> إيقاف وإنشاء الملف
        </button>
      </div>
      <p className={styles.recordStatus}>
        {state === "recording"
          ? "● يسجّل الآن"
          : state === "paused"
            ? "التسجيل مؤقتًا متوقف"
            : state === "stopping"
              ? "جارٍ إنهاء الملف"
              : "لا يوجد تسجيل نشط"}{" "}
        · {seconds} ثانية · {(bytes / 1024 / 1024).toFixed(1)} MB
      </p>
      {message && <output className={styles.mediaNotice}>{message}</output>}
      {url && (
        <div className={styles.recordingPreview}>
          {/* biome-ignore lint/a11y/useMediaCaption: User-generated local recording has no transcript; no fabricated captions are added. */}
          <video
            controls
            playsInline
            src={url}
            aria-label="معاينة تسجيل الشاشة"
          />
          <div className={styles.transferActions}>
            <a
              className={styles.primary}
              download={`zooka-screen.${mime.includes("mp4") ? "mp4" : "webm"}`}
              href={url}
            >
              <Download size={16} /> تنزيل التسجيل
            </a>
            <button className={styles.secondary} onClick={remove} type="button">
              <Trash2 size={16} /> حذف التسجيل
            </button>
          </div>
          <p>
            نزّل الملف قبل مغادرة الصفحة. قد يتضمن معلومات حساسة أو صوت المصدر؛
            راجعه قبل مشاركته.
          </p>
        </div>
      )}
    </section>
  );
}
