"use client";
import { Activity, Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import { diagnosticMessage } from "@/lib/integration-hub/messages";
import styles from "./creative.module.css";

interface Overview {
  window: { since: string; until: string };
  media: { status: string; type: string; count: number }[];
  projects: number;
  usage: { event: string; count: number }[];
  recent: { id: string; type: string; status: string; createdAt: string }[];
  estimatedCost: null;
  storageBytes: null;
  scope: string;
}
export function WorkspaceOverview({ lang }: { lang: "ar" | "en" }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [days, setDays] = useState("7");
  const [data, setData] = useState<Overview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const res = await fetch(`/api/creative/overview?days=${days}`, {
        cache: "no-store",
      });
      if (res.redirected) {
        throw new Error("SIGN_IN_REQUIRED");
      }
      const value = await res.json();
      if (!res.ok) {
        throw new Error(value.error ?? "SERVICE_UNAVAILABLE");
      }
      setData(value);
      setMessage("");
    } catch (error) {
      setData(null);
      setMessage(
        diagnosticMessage(
          error instanceof Error ? error.message : "SERVICE_UNAVAILABLE",
          lang
        )
      );
    } finally {
      setBusy(false);
    }
  }
  function report() {
    if (!data) {
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "zooka-workspace-report.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className={styles.section}>
      <h2>
        <Activity size={23} />
        {t("لوحة تشغيل المساحة", "Workspace operations")}
      </h2>
      <p>
        {t(
          "لا تُعرض أرقام حسابك قبل قراءتها. هذه بيانات المساحة لا جميع المستخدمين، ولا تشمل التصاميم المحلية على جهازك.",
          "No account metrics appear until read. Data is workspace-scoped, excludes local browser designs, and is not global user data."
        )}
      </p>
      <div className={styles.tools}>
        <label>
          {t("الفترة بالأيام", "Window in days")}
          <select onChange={(e) => setDays(e.target.value)} value={days}>
            {[1, 7, 30, 90].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button disabled={busy} onClick={() => load()} type="button">
          <RefreshCw size={16} />
          {t("قراءة البيانات", "Read metrics")}
        </button>
        <button disabled={!data} onClick={report} type="button">
          <Download size={16} />
          {t("تصدير تقرير JSON", "Export JSON report")}
        </button>
      </div>
      <p role="status">{message}</p>
      <div className={styles.stats}>
        <div className={styles.panel}>
          {t("مشاريع HTML المعدلة", "Updated HTML projects")}
          <strong>{data ? data.projects : "—"}</strong>
        </div>
        <div className={styles.panel}>
          {t("تكلفة API", "API cost")}
          <strong>—</strong>
          <small>{t("لا سجل تكلفة متحقق", "No verified cost ledger")}</small>
        </div>
        <div className={styles.panel}>
          {t("حجم التخزين", "Storage bytes")}
          <strong>—</strong>
          <small>{t("غير مقاس", "Not measured")}</small>
        </div>
      </div>
      {data && (
        <>
          <p className={styles.help}>
            {data.window.since} → {data.window.until}
          </p>
          <h3>
            {t(
              "مهام الوسائط حسب النوع والحالة",
              "Media jobs by type and state"
            )}
          </h3>
          {data.media.length ? (
            data.media.map((row) => (
              <div className={styles.panel} key={`${row.type}:${row.status}`}>
                <span>
                  {row.type} · {row.status}: {row.count}
                </span>
                <meter
                  aria-label={`${row.type} ${row.status}`}
                  max={Math.max(1, ...data.media.map((r) => r.count))}
                  min={0}
                  value={row.count}
                />
              </div>
            ))
          ) : (
            <p>
              {t(
                "لم تُسجل مهام في الفترة المحددة.",
                "No recorded jobs in this window."
              )}
            </p>
          )}
          <details>
            <summary>
              {t(
                "الاستخدام والعمليات المسجلة",
                "Recorded usage and operations"
              )}
            </summary>
            <ul>
              {data.usage.map((row) => (
                <li key={row.event}>
                  {row.event}: {row.count}
                </li>
              ))}
            </ul>
            <ul>
              {data.recent.map((row) => (
                <li key={row.id}>
                  {row.createdAt} · {row.type} · {row.status}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
