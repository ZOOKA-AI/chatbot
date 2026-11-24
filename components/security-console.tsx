"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Lang = "ar" | "en";
type Secret = { name: string };
type Editor = { kind: "add" } | { kind: "rotate"; name: string };

const secretsUrl = "/api/workspace/secrets";
const itemUrl = (name: string) => `${secretsUrl}/${encodeURIComponent(name)}`;

export async function fetchSecretNames(): Promise<Secret[]> {
  const response = await fetch(secretsUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("secrets" in data) || !Array.isArray(data.secrets)) {
    throw new Error("invalid response");
  }
  // Keep only names in client state, even if a future API accidentally adds fields.
  return data.secrets.map((row: unknown) => {
    if (!row || typeof row !== "object" || !("name" in row) || typeof row.name !== "string") {
      throw new Error("invalid response");
    }
    return { name: row.name };
  });
}

export async function changeSecret(
  method: "POST" | "PATCH" | "DELETE",
  name: string,
  value?: string,
): Promise<void> {
  const response = await fetch(method === "POST" ? secretsUrl : itemUrl(name), {
    method,
    cache: "no-store",
    ...(method === "DELETE"
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(method === "POST" ? { name, value } : { value }),
        }),
  });
  if (!response.ok) throw new Error(String(response.status));
}

export async function secretDetectionSetting(enabled?: boolean): Promise<boolean> {
  const response = await fetch(`${secretsUrl}/settings`, {
    cache: "no-store",
    ...(enabled === undefined
      ? {}
      : {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled }),
        }),
  });
  if (!response.ok) throw new Error(String(response.status));
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("enabled" in data) || typeof data.enabled !== "boolean") {
    throw new Error("invalid response");
  }
  return data.enabled;
}

export function SecurityConsole({ canManage, lang }: { canManage: boolean; lang: Lang }) {
  const ar = lang === "ar";
  const t = (arabic: string, english: string) => (ar ? arabic : english);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(canManage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [detection, setDetection] = useState<boolean | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(canManage);
  const [settingsError, setSettingsError] = useState(false);
  const valueInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const clearValue = () => {
      if (valueInput.current) valueInput.current.value = "";
    };
    window.addEventListener("pagehide", clearValue);
    return () => window.removeEventListener("pagehide", clearValue);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSecrets(await fetchSecretNames());
      setError(null);
    } catch {
      setSecrets([]);
      setError(ar ? "تعذر تحميل الأسرار. حاول مرة أخرى." : "Could not load secrets. Try again.");
    } finally {
      setLoading(false);
    }
  }, [ar]);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  const loadSettings = useCallback(async () => {
    setSettingsBusy(true);
    try {
      setDetection(await secretDetectionSetting());
      setSettingsError(false);
    } catch {
      setSettingsError(true);
    } finally {
      setSettingsBusy(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) void loadSettings();
  }, [canManage, loadSettings]);

  async function mutate(method: "POST" | "PATCH" | "DELETE", name: string, value?: string) {
    setBusy(true);
    setError(null);
    try {
      await changeSecret(method, name, value);
      setEditor(null);
      setDeleting(null);
      await load();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      const messages: Record<string, string> = {
        "400": t("تحقق من الحقول وحاول مرة أخرى.", "Check the fields and try again."),
        "401": t("يرجى تسجيل الدخول مجدداً.", "Please sign in again."),
        "403": t("يلزم الوصول كمالك أو مسؤول.", "Owner or admin access is required."),
        "404": t("لم يعد السر موجوداً. أعد تحميل القائمة.", "This secret no longer exists. Reload the list."),
        "409": t("يوجد سر بهذا الاسم بالفعل.", "A secret with this name already exists."),
      };
      setError(messages[code] ?? t("تعذر حفظ التغييرات. حاول مرة أخرى.", "Could not save changes. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-lg font-semibold">{t("الأمان", "Security")}</h1>
      </header>

      <section className="flex flex-col gap-2" aria-labelledby="detection-heading">
        <h2 className="font-semibold" id="detection-heading">{t("اكتشاف الأسرار في المحادثة", "Chat secret detection")}</h2>
        {canManage && detection !== null ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={detection}
              disabled={settingsBusy}
              onChange={(event) => {
                const next = event.target.checked;
                setSettingsBusy(true);
                void secretDetectionSetting(next)
                  .then((enabled) => { setDetection(enabled); setSettingsError(false); })
                  .catch(() => setSettingsError(true))
                  .finally(() => setSettingsBusy(false));
              }}
              type="checkbox"
            />
            {t("تفعيل اكتشاف الأسرار لمساحة العمل", "Enable secret detection for this workspace")}
          </label>
        ) : null}
        {canManage && settingsBusy && detection === null ? <p className="text-sm" role="status">{t("جارٍ تحميل الإعداد…", "Loading setting…")}</p> : null}
        {canManage && settingsError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-red-600" role="alert">{t("تعذر تحميل الإعداد أو حفظه.", "Could not load or save the setting.")}</p>
            <button className="rounded border px-2 py-1 text-sm" disabled={settingsBusy} onClick={() => void loadSettings()} type="button">{t("إعادة المحاولة", "Retry")}</button>
          </div>
        ) : null}
        {!canManage ? <p className="text-sm">{t("يمكن لمالك مساحة العمل أو مسؤولها فقط تغيير هذا الإعداد.", "Only workspace owners and admins can change this setting.")}</p> : null}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="secrets-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold" id="secrets-heading">{t("أسرار مساحة العمل", "Workspace secrets")}</h2>
          {canManage && !editor ? (
            <button className="rounded border px-3 py-2 text-sm" disabled={busy || loading} onClick={() => { setDeleting(null); setEditor({ kind: "add" }); }} type="button">
              {t("إضافة سر", "Add secret")}
            </button>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{t("لا يمكن عرض القيم بعد حفظها. أدخل قيمة جديدة لتدوير السر.", "Values cannot be viewed after saving. Enter a new value to rotate a secret.")}</p>
        {!canManage ? <p className="text-sm" role="status">{t("يمكن لمالك مساحة العمل أو مسؤولها فقط إدارة الأسرار.", "Only workspace owners and admins can manage secrets.")}</p> : null}
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}

        {editor ? (
          <form
            action={editor.kind === "add" ? secretsUrl : itemUrl(editor.name)}
            autoComplete="off"
            className="flex flex-col gap-3 rounded-lg border p-4"
            method="post"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              const name = editor.kind === "add" ? String(data.get("name") ?? "").trim() : editor.name;
              const value = String(data.get("value") ?? "");
              form.reset();
              if (name && value) void mutate(editor.kind === "add" ? "POST" : "PATCH", name, value);
            }}
          >
            <h3 className="font-semibold text-sm">{editor.kind === "add" ? t("إضافة سر", "Add secret") : t("تدوير السر", "Rotate secret")} {editor.kind === "rotate" ? <span dir="auto">{editor.name}</span> : null}</h3>
            {editor.kind === "add" ? (
              <label className="flex flex-col gap-1 text-sm">
                {t("الاسم", "Name")}
                <input autoComplete="off" className="rounded border bg-background px-3 py-2" disabled={busy} maxLength={64} name="name" pattern="[A-Z_][A-Z0-9_]*" required />
              </label>
            ) : null}
            {editor.kind === "add" ? <p className="text-xs text-muted-foreground">{t("ابدأ بحرف إنجليزي كبير أو شرطة سفلية، ثم استخدم أحرفاً إنجليزية كبيرة أو أرقاماً أو شرطات سفلية فقط.", "Start with an uppercase English letter or underscore; use only uppercase English letters, numbers, and underscores.")}</p> : null}
            <label className="flex flex-col gap-1 text-sm">
              {editor.kind === "add" ? t("القيمة", "Value") : t("القيمة الجديدة", "New value")}
              <input autoComplete="off" className="rounded border bg-background px-3 py-2" disabled={busy} maxLength={8192} name="value" ref={valueInput} required type="password" />
            </label>
            <div className="flex gap-2">
              <button className="rounded bg-primary px-3 py-2 text-primary-foreground text-sm disabled:opacity-40" disabled={busy} type="submit">{t("حفظ", "Save")}</button>
              <button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => setEditor(null)} type="button">{t("إلغاء", "Cancel")}</button>
            </div>
          </form>
        ) : null}

        {loading ? <p className="text-sm" role="status">{t("جارٍ التحميل…", "Loading…")}</p> : null}
        {canManage && !loading && !error && secrets.length === 0 ? <p className="text-sm text-muted-foreground">{t("لا توجد أسرار بعد.", "No secrets yet.")}</p> : null}
        <ul className="flex flex-col gap-2">
          {secrets.map((secret) => (
            <li className="rounded-lg border p-4" key={secret.name}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-all font-medium" dir="auto">{secret.name}</span>
                <div className="flex gap-2">
                  <button className="rounded border px-2 py-1 text-sm" disabled={busy || loading || Boolean(editor)} onClick={() => { setDeleting(null); setEditor({ kind: "rotate", name: secret.name }); }} type="button">{t("تدوير", "Rotate")}<span className="sr-only"> {secret.name}</span></button>
                  <button className="rounded border px-2 py-1 text-sm" disabled={busy || loading || Boolean(editor)} onClick={() => setDeleting(secret.name)} type="button">{t("حذف", "Delete")}<span className="sr-only"> {secret.name}</span></button>
                </div>
              </div>
              {deleting === secret.name ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="text-sm">{t("هل تريد حذف هذا السر؟", "Delete this secret?")}</p>
                  <button className="rounded bg-destructive px-2 py-1 text-destructive-foreground text-sm" disabled={busy} onClick={() => void mutate("DELETE", secret.name)} type="button">{t("تأكيد الحذف", "Confirm delete")}<span className="sr-only"> {secret.name}</span></button>
                  <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => setDeleting(null)} type="button">{t("إلغاء", "Cancel")}</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {canManage && error ? <button className="self-start rounded border px-3 py-2 text-sm" disabled={loading || busy} onClick={() => void load()} type="button">{t("إعادة تحميل القائمة", "Reload list")}</button> : null}
      </section>
    </div>
  );
}
