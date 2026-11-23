"use client";

import { useCallback, useEffect, useState } from "react";

type Skill = {
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
};

type Draft = Pick<Skill, "name" | "description" | "instructions">;
type Lang = "ar" | "en";

const emptyDraft: Draft = { name: "", description: "", instructions: "" };

export function hasSkillTrigger(description: string): boolean {
  return /use\s+when|استخدم\s+عندما/iu.test(description);
}

export function SkillsConsole({ canManage, lang }: { canManage: boolean; lang: Lang }) {
  const ar = lang === "ar";
  const t = (arabic: string, english: string) => (ar ? arabic : english);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ originalName: string | null; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/workspace/skills", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const rows = Array.isArray(data) ? data : data.skills ?? data.items ?? data.data;
      if (!Array.isArray(rows)) throw new Error();
      setSkills(rows);
      setError(null);
    } catch {
      setError(ar ? "تعذر تحميل المهارات. حاول مرة أخرى." : "Could not load skills. Try again.");
    } finally {
      setLoading(false);
    }
  }, [ar]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(url: string, method: string, data?: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        ...(data ? { headers: { "content-type": "application/json" }, body: JSON.stringify(data) } : {}),
      });
      if (!response.ok) {
        const messages: Record<number, string> = {
          400: t("تحقق من الحقول وحاول مرة أخرى.", "Check the fields and try again."),
          401: t("يرجى تسجيل الدخول مجدداً.", "Please sign in again."),
          403: t("تحتاج إلى صلاحية المالك أو المسؤول لإجراء التغييرات.", "Owner or admin access is required to make changes."),
          404: t("لم تعد هذه المهارة موجودة. أعد تحميل القائمة.", "This skill no longer exists. Reload the list."),
          409: t("يوجد اسم مهارة مطابق بالفعل.", "A skill with this name already exists."),
        };
        throw new Error(messages[response.status] ?? t("تعذر حفظ التغييرات. حاول مرة أخرى.", "Could not save changes. Try again."));
      }
      setEditor(null);
      setDeleting(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : t("تعذر حفظ التغييرات. حاول مرة أخرى.", "Could not save changes. Try again."));
    } finally {
      setBusy(false);
    }
  }

  function itemUrl(name: string) {
    return `/api/workspace/skills/${encodeURIComponent(name)}`;
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-lg font-semibold">{t("مهارات مساحة العمل", "Workspace skills")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("أنشئ المهارات وحدد متى يستخدمها الوكيل.", "Create skills and describe when the agent should use them.")}
        </p>
      </header>

      {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-sm">{t("المهارات", "Skills")}</h2>
        {canManage && !editor ? (
          <button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => { setDeleting(null); setEditor({ originalName: null, draft: emptyDraft }); }} type="button">
            {t("مهارة جديدة", "New skill")}
          </button>
        ) : null}
      </div>

      {editor ? (
        <form
          className="flex flex-col gap-3 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const draft = { ...editor.draft, name: editor.draft.name.trim(), description: editor.draft.description.trim() };
            if (!draft.name || !draft.description || !draft.instructions.trim()) return;
            void mutate(
              editor.originalName === null ? "/api/workspace/skills" : itemUrl(editor.originalName),
              editor.originalName === null ? "POST" : "PATCH",
              { ...draft, instructions: draft.instructions.trim() }
            );
          }}
        >
          <h2 className="font-semibold text-sm">
            {editor.originalName === null ? t("مهارة جديدة", "New skill") : t("تعديل المهارة", "Edit skill")}
          </h2>
          <label className="flex flex-col gap-1 text-sm">
            {t("الاسم", "Name")}
            <input className="rounded border bg-background px-3 py-2" disabled={busy} maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" required value={editor.draft.name} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, name: event.target.value } })} />
          </label>
          <p className="text-muted-foreground text-xs">{t("استخدم حروفاً إنجليزية صغيرة وأرقاماً، وافصل الكلمات بشرطة واحدة.", "Use lowercase English letters and numbers, separated by single hyphens.")}</p>
          <label className="flex flex-col gap-1 text-sm">
            {t("الوصف", "Description")}
            <textarea className="rounded border bg-background px-3 py-2" disabled={busy} maxLength={2000} required rows={3} value={editor.draft.description} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, description: event.target.value } })} />
          </label>
          {!hasSkillTrigger(editor.draft.description) ? (
            <p className="text-amber-700 text-sm" role="status">
              {t("يُفضّل أن يتضمن الوصف «استخدم عندما» لتوضيح متى تُستخدم المهارة. يمكنك الحفظ رغم ذلك.", "Consider including “Use when” in the description to explain when to use this skill. You can still save.")}
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            {t("التعليمات", "Instructions")}
            <textarea className="rounded border bg-background px-3 py-2" disabled={busy} maxLength={16000} required rows={8} value={editor.draft.instructions} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, instructions: event.target.value } })} />
          </label>
          <div className="flex gap-2">
            <button className="rounded bg-primary px-3 py-2 text-primary-foreground text-sm disabled:opacity-40" disabled={busy || !editor.draft.name.trim() || !editor.draft.description.trim() || !editor.draft.instructions.trim()} type="submit">{t("حفظ", "Save")}</button>
            <button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => setEditor(null)} type="button">{t("إلغاء", "Cancel")}</button>
          </div>
        </form>
      ) : null}

      {loading ? <p className="text-sm" role="status">{t("جارٍ التحميل…", "Loading…")}</p> : null}
      {!loading && !error && skills.length === 0 ? <p className="text-sm text-muted-foreground">{t("لا توجد مهارات بعد.", "No skills yet.")}</p> : null}
      <ul className="flex flex-col gap-2">
        {skills.map((skill) => (
          <li className="rounded-lg border p-4" key={skill.name}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words font-medium" dir="auto">{skill.name}</h3>
                <p className="break-words text-muted-foreground text-sm" dir="auto">{skill.description}</p>
                <p className="mt-1 text-xs">{skill.enabled ? t("مفعّلة", "Enabled") : t("معطّلة", "Disabled")}</p>
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={skill.enabled} disabled={busy || Boolean(editor)} onChange={(event) => void mutate(itemUrl(skill.name), "PATCH", { enabled: event.target.checked })} />
                    {t("تفعيل", "Enable")}
                    <span className="sr-only"> {skill.name}</span>
                  </label>
                  <button className="rounded border px-2 py-1 text-sm" disabled={busy || Boolean(editor)} onClick={() => { setDeleting(null); setEditor({ originalName: skill.name, draft: { name: skill.name, description: skill.description ?? "", instructions: skill.instructions ?? "" } }); }} type="button">{t("تعديل", "Edit")}<span className="sr-only"> {skill.name}</span></button>
                  <button className="rounded border px-2 py-1 text-sm" disabled={busy || Boolean(editor)} onClick={() => setDeleting(skill.name)} type="button">{t("حذف", "Delete")}<span className="sr-only"> {skill.name}</span></button>
                </div>
              ) : null}
            </div>
            {deleting === skill.name ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-sm">{t("هل تريد حذف هذه المهارة؟", "Delete this skill?")}</p>
                <button className="rounded bg-destructive px-2 py-1 text-destructive-foreground text-sm" disabled={busy} onClick={() => void mutate(itemUrl(skill.name), "DELETE")} type="button">{t("تأكيد الحذف", "Confirm delete")}</button>
                <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => setDeleting(null)} type="button">{t("إلغاء", "Cancel")}</button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <button className="self-start rounded border px-3 py-2 text-sm" disabled={loading || busy} onClick={() => void load()} type="button">{t("إعادة تحميل القائمة", "Reload list")}</button> : null}
    </div>
  );
}
