"use client";
import { ClipboardList, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AGENT_DRAFT_KEY, makeAgentBrief } from "@/lib/studio-media";
import styles from "./studio.module.css";
export function AgentBrief() {
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [output, setOutput] = useState("خطة عملية ثم مسودة قابلة للمراجعة");
  const [brief, setBrief] = useState("");
  const [message, setMessage] = useState("");
  const prepare = () => {
    if (!goal.trim()) {
      setMessage("اكتب الهدف أولاً.");
      return;
    }
    setBrief(makeAgentBrief(goal, context, output));
    setMessage("أُعد الطلب كنص فقط. لم يبدأ أي وكيل أو تشغيل أدوات.");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setMessage("نُسخ الطلب. راجع النص قبل إرساله في المحادثة.");
    } catch {
      setMessage("تعذّر النسخ؛ حدّد النص أدناه يدوياً.");
    }
  };
  const transfer = () => {
    try {
      sessionStorage.setItem(
        AGENT_DRAFT_KEY,
        JSON.stringify({ text: brief, at: Date.now() }),
      );
      window.location.assign("/");
    } catch {
      setMessage("التخزين غير متاح. انسخ الطلب وافتح المحادثة بنفسك.");
    }
  };
  return (
    <>
      <header className={styles.pageHeading}>
        <span className={styles.eyebrow}>
          <ClipboardList size={17} /> حوّل الفكرة لطلب واضح
        </span>
        <h1>مخطط طلب الوكيل</h1>
        <p>
          إعداد هدف وسياق ومخرج قابل للمراجعة. ليس منفّذ مهام ولا وكيلاً جديداً؛
          التنفيذ الحقيقي داخل المحادثة بعد تسجيل الدخول ووفق الباقة والأدوات
          المتاحة.
        </p>
      </header>
      <section className={styles.mediaCard}>
        <label className={styles.mediaLabel}>
          هدف المهمة
          <input
            maxLength={500}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="ما النتيجة التي تريدها؟"
            value={goal}
          />
        </label>
        <label className={styles.mediaLabel}>
          السياق والقيود
          <textarea
            maxLength={2500}
            onChange={(e) => setContext(e.target.value)}
            placeholder="أضف المعلومات الضرورية فقط، دون أسرار أو توكنات"
            value={context}
          />
        </label>
        <label className={styles.mediaLabel}>
          المخرج المطلوب
          <input
            maxLength={500}
            onChange={(e) => setOutput(e.target.value)}
            value={output}
          />
        </label>
        <button className={styles.primary} onClick={prepare} type="button">
          إعداد الطلب للمراجعة
        </button>
        {brief && (
          <>
            <textarea
              aria-label="مسودة طلب الوكيل"
              className={styles.voiceText}
              maxLength={6000}
              onChange={(e) => setBrief(e.target.value)}
              value={brief}
            />
            <div className={styles.transferActions}>
              <button
                className={styles.secondary}
                disabled={!brief.trim()}
                onClick={() => void copy()}
                type="button"
              >
                <Copy size={16} /> نسخ المسودة
              </button>
              <button
                className={styles.primary}
                disabled={!brief.trim()}
                onClick={transfer}
                type="button"
              >
                <ExternalLink size={16} /> فتح المحادثة كمسودة
              </button>
            </div>
            <p className={styles.muted}>
              تُحفظ المسودة مؤقتاً في تبويبك لمدة ساعة، ولا تُرسل تلقائياً. إذا لم
              تسجّل الدخول، سجّل أولاً ثم افتح محادثة جديدة. المسودة مرتبطة
              بالتبويب لا بالحساب؛ لا تتركها على جهاز مشترك.
            </p>
          </>
        )}
        {message && <output className={styles.mediaNotice}>{message}</output>}
      </section>
      <div className={styles.releaseNote}>
        <ShieldCheck size={23} />
        <p>
          لا يكفي وجود موصل في الكتالوج للتنفيذ. راجع صلاحياتك ونتائج الأدوات.{" "}
          <Link href="/platform-readiness">الجاهزية والحدود</Link> ·{" "}
          <Link href="/studio/tasks">تنظيم المهام اليدوية</Link>
        </p>
      </div>
    </>
  );
}
