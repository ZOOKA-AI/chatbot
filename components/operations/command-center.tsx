"use client";
import {
  Activity,
  Bot,
  Download,
  FileText,
  Play,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import styles from "@/components/creative/creative.module.css";
import {
  agentRoles,
  type CommandId,
  commands,
  workflow,
} from "@/lib/operations/catalog";
export function CommandCenter() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  async function run(command: CommandId) {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "OPERATION_UNAVAILABLE");
      }
      setResult(data);
      setMessage(
        data.recorded
          ? t(
              "حُفظ التقرير للمستخدم داخل مساحته.",
              "Report recorded for this user in the workspace."
            )
          : t(
              "التقرير متاح لكن لم يُحفظ؛ صدّره الآن.",
              "Report available but not recorded; export it now."
            )
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "OPERATION_UNAVAILABLE"
      );
    } finally {
      setBusy(false);
    }
  }
  async function history() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/operations", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "HISTORY_UNAVAILABLE");
      }
      setResult(data);
      setMessage(
        t(
          "سجل المستخدم الحالي داخل المساحة فقط.",
          "Current user's history in this workspace only."
        )
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "HISTORY_UNAVAILABLE"
      );
    } finally {
      setBusy(false);
    }
  }
  function exportReport() {
    if (!result) {
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "zooka-operational-report.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main
      className={styles.root}
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
    >
      <header className={styles.header}>
        <div>
          <p>Innovate • Automate • Grow</p>
          <h1>ZOOKA COMMAND CENTER</h1>
          <p>
            {t(
              "تقنية بإيمان، تقدم بأخلاق.",
              "Technology with faith. Progress with ethics."
            )}
          </p>
        </div>
        <nav className={styles.nav}>
          <Link className={styles.link} href="/start">
            Start / البداية
          </Link>
          <Link className={styles.link} href="/chatbot">
            AI Chat / Agent
          </Link>
          <Link className={styles.link} href="/admin">
            Admin
          </Link>
          <Link className={styles.link} href="/creative">
            Creative Studio
          </Link>
          <Link className={styles.link} href="/integration-hub">
            Integration Hub
          </Link>
          <button
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            type="button"
          >
            {lang === "ar" ? "English" : "العربية"}
          </button>
        </nav>
      </header>
      <p className={styles.warning}>
        {t(
          "هذه نواة تشغيل للقراءة فقط، وليست فريق وكلاء مستقلين يعمل في الخلفية. النتائج تحتاج مسؤول مساحة مسجلاً. لا جدولة يومية أو تنفيذ كود أو نشر أو دفع تلقائي.",
          "This is a read-only operations foundation, not an autonomous background agent team. Results require a signed-in workspace admin. No daily schedule, code execution, deployment or payment automation."
        )}
      </p>
      <details>
        <summary>
          ⓘ{" "}
          {t(
            "طريقة الاستخدام وحدود الصلاحيات",
            "Usage and permission boundary"
          )}
        </summary>
        <p>
          {t(
            "شغّل /status لقراءة الدليل المتاح أو /report لإنشاء تقرير مؤرخ. تعطل المصدر يُعرض غير متاح ولا يُستبدل ببيانات وهمية. السجل مرتبط بالمستخدم والمساحة ولا يحتوي أسراراً أو هويات حسابات المزوّد. لا يثبت نجاح القراءة سلامة كل قاعدة البيانات. باقي أوامر الكتابة غير منفذة ولا يمنح الضغط عليها موافقة على نشر.",
            "Run /status to read available evidence or /report for a dated report. Failed sources remain unavailable, never fabricated. History is user/workspace scoped and excludes secrets/provider identities. A successful read is not full database certification. Other write commands are not implemented; clicking does not grant deployment approval."
          )}
        </p>
      </details>
      <section className={styles.section}>
        <h2>
          <ShieldCheck size={20} />
          {t("مسار الإصدار", "Release workflow")}
        </h2>
        <ol className={styles.tools}>
          {workflow.map((step) => (
            <li className={styles.panel} key={step}>
              {step}
            </li>
          ))}
        </ol>
        <p>
          {t(
            "لا تنتقل المراحل تلقائياً. الموافقات والاختبارات والرجوع الآمن تحتاج أدلة مسجلة.",
            "Stages do not advance automatically. Approval, tests and safe rollback require recorded evidence."
          )}
        </p>
      </section>
      <section className={styles.section}>
        <h2>
          <Activity size={22} />
          {t("الأوامر", "Commands")}
        </h2>
        <div className={styles.templates}>
          {commands.map((command) => (
            <article className={styles.panel} key={command.id}>
              <h3 className="font-semibold">{command.id}</h3>
              <p>{command.description}</p>
              <strong>{command.mode}</strong>
              {command.href ? (
                <Link className={styles.link} href={command.href}>
                  {t("افتح الأداة الحالية", "Open existing tool")}
                </Link>
              ) : (
                <button
                  disabled={busy || command.mode !== "READ_ONLY"}
                  onClick={() => run(command.id)}
                  type="button"
                >
                  <Play size={15} />
                  {t("تنفيذ قراءة", "Run read")}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className={styles.section}>
        <h2>
          <FileText size={22} />
          Daily Development Intelligence
        </h2>
        <p>
          {t(
            "تقرير عند الطلب فقط. لا توجد مهمة مجدولة، ولا تجمع هذه النواة Git أو سجلات Vercel أو تحليلات المزودين تلقائياً.",
            "On-demand report only. No scheduled task; this foundation does not automatically collect Git/Vercel logs or provider analytics."
          )}
        </p>
        <div className={styles.tools}>
          <button disabled={busy} onClick={() => run("/report")} type="button">
            {t("إنشاء تقرير الآن", "Generate report now")}
          </button>
          <button disabled={busy} onClick={history} type="button">
            {t("استرجاع آخر النتائج", "Load recent results")}
          </button>
          <button disabled={!result} onClick={exportReport} type="button">
            <Download size={15} />
            {t("تصدير JSON", "Export JSON")}
          </button>
        </div>
        <p role="status">{message}</p>
        {result !== null && (
          <pre
            className="mt-4 max-h-[600px] overflow-auto rounded-xl border p-4 text-sm break-words whitespace-pre-wrap"
            dir="ltr"
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </section>
      <section className={styles.section}>
        <h2>
          <Bot size={22} />
          {t("مسؤوليات الوكلاء المقترحة", "Proposed agent responsibilities")}
        </h2>
        <p>
          {t(
            "تعريفات حوكمة، لا عمليات مستقلة منشورة. الأدوات المسموحة هنا قراءة بيانات المساحة فقط؛ حد إنفاق المزوّد صفر لأن النواة لا تستدعي نموذجاً. تكلفة DB والاستضافة غير محسومة.",
            "Governance definitions, not deployed autonomous workers. Only workspace evidence reads are available here. Provider spend is zero because no model is called; database/hosting cost remains unknown."
          )}
        </p>
        <div className={styles.templates}>
          {agentRoles.map(([id, title, description]) => (
            <article className={styles.panel} key={id}>
              <h3>{id} AGENT</h3>
              <p>{title}</p>
              <p>{description}</p>
              <strong>DESIGN ONLY · NOT RUNNING</strong>
              <details>
                <summary>
                  ⓘ {t("حدود التشغيل والتصعيد", "Execution and escalation")}
                </summary>
                <p>
                  {t(
                    "لا صلاحيات ذاتية. لا shell أو قاعدة بيانات حرة أو وصول عالمي. أي تغيير حساس يُصعّد إلى مسؤول مخول ويحتاج خطة واختباراً وموافقة. نتائج الاختبارات الحية غير متوفرة لهذا الدور.",
                    "No self-granted permissions, shell, free-form SQL or global access. Sensitive changes escalate to an authorized owner and require plan, tests and approval. Live worker test results are unavailable for this role."
                  )}
                </p>
              </details>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
