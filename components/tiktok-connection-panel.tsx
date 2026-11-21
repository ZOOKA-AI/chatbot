"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export interface TiktokUploadRow {
  publishId: string;
  fileName: string;
  fileSize: number;
  status: string;
  failReason: string | null;
  uploadedBytes: number | null;
  createdAt: string | Date;
}

export interface TiktokPanelProps {
  configured: boolean;
  canManage: boolean;
  redirectUri: string;
  connection: {
    connected: boolean;
    displayName: string | null;
    openId: string | null;
    scopes: string[];
    accessExpiresAt: string | Date | null;
    updatedAt: string | Date | null;
  };
  uploads: TiktokUploadRow[];
  flash: { connected: boolean; account: string | null; error: string | null };
}

const ERROR_TEXT: Record<string, string> = {
  not_configured:
    "لم تُضبط مفاتيح تطبيق تيك توك على هذا النشر بعد (client key / secret).",
  forbidden: "هذا القسم لمالك المساحة ومديريها.",
  upgrade_required: "خطة المساحة الحالية لا تسمح بربط التكاملات.",
  access_denied: "أُلغي التفويض من نافذة تيك توك.",
  invalid_state: "رفضت البوابة callback غير موقّع أو منتهي. أعد المحاولة.",
  storage_failed: "تعذّر تخزين التفويض مشفّرًا. تحقق من مفتاح التشفير.",
  missing_code: "لم يصل رمز التفويض من تيك توك.",
  provider_error: "أعاد تيك توك خطأ أثناء التفويض.",
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function TiktokConnectionPanel(props: TiktokPanelProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(
    props.flash.error ? (ERROR_TEXT[props.flash.error] ?? props.flash.error) : null
  );
  const [uploads, setUploads] = useState<TiktokUploadRow[]>(props.uploads);

  const connected = props.connection.connected;

  function upload() {
    if (!file) {
      setProblem("اختر ملف فيديو أولًا.");
      return;
    }
    setBusy(true);
    setProblem(null);
    setMessage(null);
    setProgress(0);
    const body = new FormData();
    body.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/integrations/tiktok/upload");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      setBusy(false);
      setProgress(null);
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        setMessage(
          `وصل الفيديو إلى صندوقك في تيك توك. المعرّف: ${String(payload.publishId ?? "")}`
        );
        setUploads((current) => [
          {
            publishId: String(payload.publishId ?? ""),
            fileName: String(payload.fileName ?? file.name),
            fileSize: Number(payload.fileSize ?? file.size),
            status: "UPLOADED",
            failReason: null,
            uploadedBytes: Number(payload.fileSize ?? file.size),
            createdAt: new Date().toISOString(),
          },
          ...current,
        ]);
        setFile(null);
        if (fileInput.current) {
          fileInput.current.value = "";
        }
        router.refresh();
      } else {
        setProblem(
          `فشل الرفع: ${String(payload.error ?? xhr.status)}${
            payload.detail ? ` — ${String(payload.detail)}` : ""
          }`
        );
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setProgress(null);
      setProblem("انقطع الاتصال أثناء الرفع.");
    };
    xhr.send(body);
  }

  async function disconnect() {
    setBusy(true);
    setProblem(null);
    const response = await fetch("/api/integrations/tiktok/disconnect", {
      method: "POST",
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setProblem("تعذّر فصل الحساب. أعد المحاولة.");
      return;
    }
    setMessage("فُصل الحساب وأُلغي التوكن عند تيك توك.");
    router.refresh();
  }

  async function refreshStatus(publishId: string) {
    const response = await fetch(
      `/api/integrations/tiktok/upload/${encodeURIComponent(publishId)}`
    ).catch(() => null);
    if (!response?.ok) {
      setProblem("تعذّر قراءة حالة هذا الرفع من تيك توك.");
      return;
    }
    const payload = (await response.json()) as {
      status?: string;
      failReason?: string | null;
      uploadedBytes?: number | null;
    };
    setUploads((current) =>
      current.map((row) =>
        row.publishId === publishId
          ? {
              ...row,
              status: payload.status ?? row.status,
              failReason: payload.failReason ?? null,
              uploadedBytes: payload.uploadedBytes ?? row.uploadedBytes,
            }
          : row
      )
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {props.flash.connected ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          تم ربط حساب تيك توك{props.flash.account ? ` (${props.flash.account})` : ""}.
        </p>
      ) : null}
      {problem ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {problem}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}

      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              {connected ? "مرتبط" : "غير مرتبط"}
            </span>
            <span className="text-xs opacity-70" dir="ltr">
              {connected
                ? `${props.connection.displayName ?? "TikTok creator"} · open_id ${props.connection.openId ?? ""}`
                : "OAuth يبدأ من هنا ويُفوّض حسابك أنت فقط."}
            </span>
            {connected && props.connection.scopes.length > 0 ? (
              <span className="text-xs opacity-60" dir="ltr">
                granted: {props.connection.scopes.join(", ")}
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            {connected ? (
              <button
                className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-200 disabled:opacity-50"
                disabled={busy}
                onClick={disconnect}
                type="button"
              >
                فصل الحساب
              </button>
            ) : (
              <a
                className="rounded-md bg-[#2E86AB] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                href="/api/integrations/tiktok/authorize"
                aria-disabled={!props.configured || !props.canManage}
              >
                ربط حساب تيك توك
              </a>
            )}
          </div>
        </div>
        {!props.configured ? (
          <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            الربط معطّل الآن: مفاتيح التطبيق أو مفتاح التشفير غير مضبوطين على هذا
            النشر. زر الربط لا يعمل قبل ضبطهما.
          </p>
        ) : null}
        <p className="mt-3 text-[11px] opacity-50" dir="ltr">
          redirect URI: {props.redirectUri}
        </p>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-medium">رفع فيديو إلى صندوقك</h2>
        <p className="mt-1 text-xs opacity-70">
          الفيديو يذهب إلى Inbox في تيك توك، ثم تكمل النشر من التطبيق. لا نشر
          تلقائي.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            accept="video/mp4,video/quicktime,video/webm"
            className="text-xs"
            disabled={!connected || busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            ref={fileInput}
            type="file"
          />
          <button
            className="rounded-md border border-white/20 px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={!connected || !file || busy}
            onClick={upload}
            type="button"
          >
            {busy ? "جارٍ الرفع…" : "رفع"}
          </button>
          {file ? (
            <span className="text-xs opacity-70" dir="ltr">
              {file.name} · {formatBytes(file.size)}
            </span>
          ) : null}
        </div>
        {progress !== null ? (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-white/10">
            <div
              className="h-full bg-[#2E86AB] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-medium">آخر عمليات الرفع</h2>
        {uploads.length === 0 ? (
          <p className="mt-2 text-xs opacity-60">لا يوجد رفع بعد.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {uploads.map((row) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2 text-xs"
                key={row.publishId}
              >
                <span className="flex flex-col">
                  <span dir="ltr">{row.fileName}</span>
                  <span className="opacity-60" dir="ltr">
                    {formatBytes(row.fileSize)} · {row.publishId}
                  </span>
                  {row.failReason ? (
                    <span className="text-red-300" dir="ltr">
                      {row.failReason}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded border border-white/20 px-2 py-0.5" dir="ltr">
                    {row.status}
                  </span>
                  <button
                    className="rounded border border-white/20 px-2 py-0.5 disabled:opacity-50"
                    disabled={!connected}
                    onClick={() => refreshStatus(row.publishId)}
                    type="button"
                  >
                    تحديث الحالة
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
