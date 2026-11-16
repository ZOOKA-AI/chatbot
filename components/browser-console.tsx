"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The customer's browser panel.
 *
 * Arabic first and honest by construction: the frame shown is fetched from the running browser at
 * that moment, and when there is no running browser the panel says so rather than showing the last
 * picture. Every button calls the server and reports the server's answer, including refusals.
 */

type Session = {
  id: string;
  status: string;
  controlHolder: string;
  currentUrl: string | null;
  currentTitle: string | null;
  startUrl: string | null;
  lastError: string | null;
  stepCount: number;
  createdAt: string;
  expiresAt: string;
};

type EventRow = { id: string; seq: number; kind: string; actor: string; createdAt: string };
type EvidenceRow = { id: string; label: string; url: string | null; createdAt: string; bytes: number };

const STATUS_LABELS: Record<string, string> = {
  created: "جاهزة للبدء",
  starting: "تُفتح",
  ready: "المتصفح مفتوح",
  running: "يعمل",
  paused: "متوقف مؤقتًا",
  taken_over: "بيدك الآن",
  stopping: "يُغلق",
  stopped: "مغلق",
  expired: "انتهت",
  failed: "فشل",
};

const CONTROL_LABELS: Record<string, string> = {
  pause: "إيقاف مؤقت",
  resume: "متابعة",
  take_over: "تولّي التحكم",
  return_control: "إعادة للوكيل",
  stop: "إنهاء الجلسة",
};

const ACTIONABLE: Record<string, string[]> = {
  created: ["start"],
  failed: ["start"],
  ready: ["pause", "take_over", "stop"],
  running: ["pause", "take_over", "stop"],
  paused: ["resume", "take_over", "stop"],
  taken_over: ["return_control", "stop"],
};

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json().catch(() => ({}))) as T;
  return { ok: response.ok, data };
}

export function BrowserConsole() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ session: Session; events: EventRow[]; evidence: EvidenceRow[]; runtime: { live: boolean; engine: string | null } } | null>(null);
  const [startUrl, setStartUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const frameKey = useRef(0);
  const [frameTick, setFrameTick] = useState(0);

  const loadSessions = useCallback(async () => {
    const { ok, data } = await call<{ sessions: Session[] }>("/api/workspace/browser/sessions");
    if (ok) {
      setSessions(data.sessions ?? []);
      if (!activeId && data.sessions?.length) setActiveId(data.sessions[0].id);
    }
  }, [activeId]);

  const loadDetail = useCallback(async (id: string) => {
    const { ok, data } = await call<NonNullable<typeof detail>>(`/api/workspace/browser/sessions/${id}`);
    if (ok) setDetail(data);
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!activeId) return;
    void loadDetail(activeId);
    const timer = setInterval(() => {
      void loadDetail(activeId);
      frameKey.current += 1;
      setFrameTick(frameKey.current);
    }, 2000);
    return () => clearInterval(timer);
  }, [activeId, loadDetail]);

  const createSession = async () => {
    setBusy(true);
    setNotice(null);
    const { ok, data } = await call<{ session?: Session; error?: string }>("/api/workspace/browser/sessions", {
      method: "POST",
      body: JSON.stringify({ startUrl: startUrl || undefined, ttlMinutes: 15 }),
    });
    setBusy(false);
    if (!ok || !data.session) {
      setNotice(`تعذّر إنشاء الجلسة: ${data.error ?? "خطأ غير معروف"}`);
      return;
    }
    setNotice("أُنشئت الجلسة. اضغط «تشغيل» ليُفتح المتصفح الحقيقي.");
    setActiveId(data.session.id);
    await loadSessions();
  };

  const control = async (action: string) => {
    if (!activeId) return;
    setBusy(true);
    setNotice(null);
    const { ok, data } = await call<{ session?: Session; error?: string }>(
      `/api/workspace/browser/sessions/${activeId}/control`,
      { method: "POST", body: JSON.stringify({ action }) }
    );
    setBusy(false);
    if (!ok) {
      setNotice(`رُفض الإجراء (${action}): ${data.error ?? "غير مسموح"}`);
    } else {
      setNotice(`تم: ${CONTROL_LABELS[action] ?? action}`);
    }
    await loadDetail(activeId);
    await loadSessions();
  };

  const session = detail?.session ?? sessions.find((row) => row.id === activeId) ?? null;
  const available = session ? ACTIONABLE[session.status] ?? [] : [];
  const live = Boolean(detail?.runtime.live);

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-4 text-sm" style={{ color: "#F8F9FA" }}>
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">متصفح الوكيل</h1>
        <p className="text-xs opacity-70">
          جلسة متصفح حقيقية خاصة بمساحتك. ما تراه صورة تُلتقط من المتصفح الآن، لا تسجيل سابق.
        </p>
        <p className="text-xs opacity-60">
          المحرك: {detail?.runtime.engine ?? "غير مُشغَّل"} · الجلسات النشطة: {sessions.filter((row) => !["stopped", "expired", "failed"].includes(row.status)).length}
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-2 rounded border border-white/10 p-3">
        <label className="flex flex-1 flex-col gap-1 text-xs">
          عنوان الموقع (اختياري)
          <input
            value={startUrl}
            onChange={(event) => setStartUrl(event.target.value)}
            placeholder="https://example.com"
            className="rounded border border-white/20 bg-transparent px-2 py-1"
            dir="ltr"
          />
        </label>
        <button
          type="button"
          onClick={createSession}
          disabled={busy}
          className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: "#2E86AB" }}
        >
          جلسة جديدة
        </button>
      </section>

      {notice ? (
        <p className="rounded border border-white/10 px-3 py-2 text-xs" style={{ background: "rgba(162,59,114,0.15)" }}>
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-4">
        <aside className="flex min-w-[200px] flex-col gap-1">
          <h2 className="text-xs font-semibold opacity-70">الجلسات ({sessions.length})</h2>
          {sessions.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setActiveId(row.id)}
              className="rounded border px-2 py-1 text-start text-xs"
              style={{
                borderColor: row.id === activeId ? "#2E86AB" : "rgba(255,255,255,0.15)",
                background: row.id === activeId ? "rgba(46,134,171,0.18)" : "transparent",
              }}
            >
              <span className="block font-medium">{STATUS_LABELS[row.status] ?? row.status}</span>
              <span className="block opacity-60" dir="ltr">{row.currentUrl ?? row.startUrl ?? "بلا عنوان"}</span>
            </button>
          ))}
          {sessions.length === 0 ? <p className="text-xs opacity-60">لا جلسات بعد.</p> : null}
        </aside>

        <main className="flex min-w-[320px] flex-1 flex-col gap-3">
          {session ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded px-2 py-0.5" style={{ background: "rgba(46,134,171,0.25)" }}>
                  {STATUS_LABELS[session.status] ?? session.status}
                </span>
                <span className="opacity-70">التحكم: {session.controlHolder === "human" ? "بيدك" : "بيد الوكيل"}</span>
                <span className="opacity-60" dir="ltr">{session.currentUrl ?? "—"}</span>
                {session.lastError ? <span style={{ color: "#ffb4b4" }}>آخر خطأ: {session.lastError}</span> : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {available.includes("start") ? (
                  <button type="button" onClick={() => control("start")} disabled={busy} className="rounded px-3 py-1.5 text-xs" style={{ background: "#2E86AB" }}>
                    تشغيل
                  </button>
                ) : null}
                {available
                  .filter((action) => action !== "start")
                  .map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => control(action)}
                      disabled={busy}
                      className="rounded border border-white/25 px-3 py-1.5 text-xs"
                    >
                      {CONTROL_LABELS[action]}
                    </button>
                  ))}
                {available.length === 0 ? <span className="text-xs opacity-60">لا إجراءات متاحة في هذه الحالة.</span> : null}
              </div>

              <div className="rounded border border-white/10 p-2">
                {live ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={frameTick}
                    src={`/api/workspace/browser/sessions/${session.id}/frame?t=${frameTick}`}
                    alt="لقطة حية من المتصفح"
                    className="w-full rounded"
                  />
                ) : (
                  <p className="text-xs opacity-70">
                    لا متصفح متصل بهذه الجلسة الآن. تُعرض الصورة الحيّة فقط عندما يكون المتصفح مفتوحًا فعليًا.
                  </p>
                )}
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold opacity-70">سجل الخطوات ({detail?.events.length ?? 0})</h3>
                <ol className="flex flex-col gap-1 text-xs">
                  {(detail?.events ?? []).map((event) => (
                    <li key={event.id}>
                      <span className="opacity-50">#{event.seq}</span> · {event.kind} ·{" "}
                      {event.actor === "human" ? "أنت" : event.actor === "system" ? "النظام" : "الوكيل"}
                    </li>
                  ))}
                  {(detail?.events.length ?? 0) === 0 ? <li className="opacity-60">لا خطوات بعد.</li> : null}
                </ol>
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold opacity-70">لقطات محفوظة ({detail?.evidence.length ?? 0})</h3>
                <div className="flex flex-wrap gap-2">
                  {(detail?.evidence ?? []).map((shot) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={shot.id}
                      src={`/api/workspace/browser/sessions/${session.id}/evidence/${shot.id}`}
                      alt={shot.label}
                      className="h-24 rounded border border-white/10"
                    />
                  ))}
                  {(detail?.evidence.length ?? 0) === 0 ? <p className="text-xs opacity-60">لا لقطات بعد.</p> : null}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs opacity-70">أنشئ جلسة لتبدأ.</p>
          )}
        </main>
      </div>
    </div>
  );
}
