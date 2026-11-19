"use client";
import { Copy, Download, Mic, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { speakText, stopSpeaking } from "@/hooks/use-voice-mode";
import styles from "./studio.module.css";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((e: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
function engine() {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}
export function VoiceNotebook() {
  const [text, setText] = useState("");
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [supported, setSupported] = useState(false);
  const [tts, setTts] = useState(false);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const ref = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const base = useRef("");
  useEffect(() => {
    setSupported(window.isSecureContext && !!engine());
    setTts("speechSynthesis" in window);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (ref.current) {
        ref.current.onresult = null;
        ref.current.onerror = null;
        ref.current.onend = null;
        ref.current.abort();
      }
      stopSpeaking();
    };
  }, []);
  const start = () => {
    const Ctor = engine();
    if (!Ctor || ref.current || !consent) return;
    stopSpeaking();
    base.current = text.trim();
    setLive("");
    setMessage("");
    const r = new Ctor();
    ref.current = r;
    r.lang = lang === "ar" ? "ar-SA" : "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const item = event.results[i];
        if (item.isFinal) final += ` ${item[0].transcript}`;
        else interim += ` ${item[0].transcript}`;
      }
      setText(`${base.current} ${final}`.trim().slice(0, 6000));
      setLive(interim.trim());
    };
    r.onerror = (event) =>
      setMessage(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "لم يسمح المتصفح أو خدمة التعرف باستخدام الميكروفون."
          : `تعذّر الإملاء (${event.error}). لا توجد خدمة تفريغ احتياطية في هذا الدفتر.`,
      );
    r.onend = () => {
      ref.current = null;
      setListening(false);
      setLive("");
      if (timer.current) clearTimeout(timer.current);
    };
    try {
      r.start();
      setListening(true);
      timer.current = setTimeout(() => {
        r.stop();
        setMessage("أُوقف الإملاء بعد دقيقة؛ راجع النص النهائي قبل استخدامه.");
      }, 60_000);
    } catch {
      ref.current = null;
      setListening(false);
      setMessage(
        "تعذّر تشغيل التعرف الصوتي. جرّب متصفحاً داعماً واسمح بالميكروفون.",
      );
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("نُسخ النص بعد مراجعتك، دون إرساله لأي وكيل.");
    } catch {
      setMessage("تعذّر النسخ. حدّد النص وانسخه يدوياً أو نزّله.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "zooka-voice-note.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section aria-label="دفتر الصوت" className={styles.mediaCard}>
      <h2>
        <Mic size={22} /> دفتر الصوت والقراءة
      </h2>
      <p>
        تحدث ليُكتب النص ثم راجعه. هذه ليست مكالمة مباشرة مع نموذج. قد يرسل
        المتصفح الصوت إلى خدمة التعرف التابعة له؛ لا نضمن المعالجة محلياً. Zooka
        لا يرفع تسجيلًا من هذا الدفتر ولا يحفظه.
      </p>
      <label className={styles.mediaCheck}>
        <input
          checked={consent}
          disabled={listening}
          onChange={(e) => setConsent(e.target.checked)}
          type="checkbox"
        />{" "}
        أفهم معالجة الصوت المحتملة من المتصفح وأريد بدء الإملاء
      </label>
      <label className={styles.mediaLabel}>
        لغة الصوت
        <select
          disabled={listening}
          onChange={(e) => setLang(e.target.value as "ar" | "en")}
          value={lang}
        >
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </label>
      {!supported && (
        <p className={styles.muted}>
          الإملاء غير مدعوم هنا. يمكنك الكتابة واستخدام القراءة إذا توفرت أصوات
          الجهاز.
        </p>
      )}
      <div className={styles.transferActions}>
        <button
          className={styles.primary}
          disabled={!supported || !consent || listening}
          onClick={start}
          type="button"
        >
          <Mic size={16} /> ابدأ الإملاء
        </button>
        <button
          className={styles.secondary}
          disabled={!listening}
          onClick={() => ref.current?.stop()}
          type="button"
        >
          <Square size={16} /> إيقاف الإملاء
        </button>
      </div>
      <textarea
        aria-label="نص دفتر الصوت"
        className={styles.voiceText}
        disabled={listening}
        maxLength={6000}
        onChange={(e) => setText(e.target.value)}
        placeholder="اكتب أو أمْلِ نصك هنا؛ لن يُرسل تلقائياً…"
        value={text}
      />
      {live && <output className={styles.mediaNotice}>نص مؤقت: {live}</output>}
      <div className={styles.transferActions}>
        <button
          className={styles.secondary}
          disabled={!tts || !text.trim() || listening}
          onClick={() => {
            if (!speakText(text, lang))
              setMessage(
                "القراءة غير متاحة أو النص فارغ. أصوات الجهاز قد لا تدعم العربية.",
              );
          }}
          type="button"
        >
          <Volume2 size={16} /> اقرأ النص
        </button>
        <button
          className={styles.secondary}
          disabled={!tts}
          onClick={stopSpeaking}
          type="button"
        >
          إيقاف القراءة
        </button>
        <button
          className={styles.secondary}
          disabled={!text.trim() || listening}
          onClick={() => void copy()}
          type="button"
        >
          <Copy size={16} /> نسخ النص
        </button>
        <button
          className={styles.secondary}
          disabled={!text.trim() || listening}
          onClick={download}
          type="button"
        >
          <Download size={16} /> تنزيل النص
        </button>
      </div>
      <p className={styles.muted}>
        {text.length} / 6000 حرف · النص في ذاكرة الصفحة فقط. نزّله قبل المغادرة.
        القراءة تستخدم أصوات المتصفح وليست صوت نموذج حي.
      </p>
      {message && <output className={styles.mediaNotice}>{message}</output>}
    </section>
  );
}
