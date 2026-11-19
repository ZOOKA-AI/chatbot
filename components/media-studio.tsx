"use client";

import Link from "next/link";
import { useState } from "react";

const modes = [
  {
    id: "IMAGE",
    title: "صورة",
    example:
      "مدينة مستقبلية مضاءة بالنيون، ألوان أزرق وبنفسجي، منظور واسع وتفاصيل معمارية.",
  },
  {
    id: "VIDEO",
    title: "فيديو سينمائي",
    example:
      "لقطة افتتاحية لمدينة مستقبلية وقت الغروب، حركة كاميرا بطيئة فوق الأبراج، دون نصوص.",
  },
  {
    id: "MAP_3D",
    title: "مشهد ومسار 3D",
    example:
      "تصور لمسار داخل مدينة خيال علمي: بوابة الوصول، ساحة مركزية، جسر مضاء، ثم منصة مشاهدة.",
  },
  {
    id: "CARTOON",
    title: "قصة كرتونية",
    example:
      "قصة من أربعة مشاهد لروبوت صغير يستكشف مدينة مستقبلية؛ شخصية متسقة وألوان مبهجة.",
  },
] as const;
type ActionType = (typeof modes)[number]["id"];
const draftKey = "zooka-media-brief-v1";

export function MediaStudio() {
  const [prompt, setPrompt] = useState("");
  const [actionType, setActionType] = useState<ActionType>("IMAGE");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const mode = modes.find((item) => item.id === actionType) ?? modes[0];

  function saveDraft() {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ prompt, actionType }));
      setNotice(
        "حُفظ الوصف على هذا المتصفح فقط. لا تستخدم جهازًا مشتركًا لحفظ معلومات حساسة."
      );
    } catch {
      setError("تعذّر الحفظ في هذا المتصفح.");
    }
  }

  function restoreDraft() {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (
        !raw ||
        typeof raw !== "object" ||
        !("prompt" in raw) ||
        typeof raw.prompt !== "string" ||
        raw.prompt.length > 4000 ||
        !("actionType" in raw)
      ) {
        setNotice("لا توجد مسودة صالحة محفوظة.");
        return;
      }
      const savedMode = modes.find((item) => item.id === raw.actionType);
      if (!savedMode) {
        return;
      }
      setPrompt(raw.prompt);
      setActionType(savedMode.id);
      setError(null);
      setNotice("استُعيدت المسودة من هذا المتصفح.");
    } catch {
      setError("تعذّر استعادة المسودة.");
    }
  }

  function exportBrief() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            kind: "creative-brief",
            actionType,
            prompt: prompt.trim(),
            generationEnabled: false,
          },
          null,
          2
        ),
      ],
      { type: "application/json;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "zooka-media-brief.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("صُدّر وصف العمل فقط؛ لم يُولّد ملف وسائط.");
  }

  return (
    <main
      className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8"
      dir="rtl"
      lang="ar"
    >
      <header className="space-y-3">
        <Link className="text-sm underline" href="/">
          العودة إلى زوكا
        </Link>
        <p className="text-muted-foreground text-sm">ZOOKA · MEDIA LAB</p>
        <h1 className="text-3xl font-bold">استوديو الوسائط والخيال العلمي</h1>
        <p className="text-muted-foreground">
          جهّز وصف الصورة أو الفيديو أو المشهد ثلاثي الأبعاد، واحفظ خطة العمل قبل
          ربط مزود التوليد.
        </p>
      </header>
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        هذه الصفحة لإعداد الوصف فقط، ولا ترسل مهام توليد أو تخصم رصيدًا. استوديو
        المهام منفصل ويتطلب تسجيل الدخول وتهيئة مزود خارجي.
        <Link className="ms-2 underline" href="/login">
          تسجيل الدخول
        </Link>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <legend className="mb-3 font-semibold">نوع المشروع</legend>
        {modes.map((item) => (
          <label
            className="flex cursor-pointer items-center gap-2 rounded-xl border p-4 has-[:checked]:border-cyan-500 has-[:checked]:bg-cyan-500/10"
            key={item.id}
          >
            <input
              checked={actionType === item.id}
              name="media-type"
              onChange={() => {
                setActionType(item.id);
                setError(null);
              }}
              type="radio"
              value={item.id}
            />
            {item.title}
          </label>
        ))}
      </fieldset>
      <section className="space-y-3 rounded-2xl border p-5">
        <label className="block font-semibold" htmlFor="media-prompt">
          وصف المشهد أو القصة
        </label>
        <textarea
          aria-describedby="media-prompt-help"
          className="bg-background min-h-40 w-full rounded-xl border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
          id="media-prompt"
          maxLength={4000}
          onChange={(event) => {
            setPrompt(event.target.value);
            setError(null);
            setNotice("");
          }}
          placeholder={mode.example}
          value={prompt}
        />
        <p className="text-muted-foreground text-sm" id="media-prompt-help">
          {prompt.length} / 4000 حرف. حدّد المشهد والإضاءة والحركة والأسلوب. لا
          تدخل أسرارًا أو معلومات شخصية.
        </p>
        <button
          className="text-sm underline"
          onClick={() => {
            setPrompt(mode.example);
            setError(null);
          }}
          type="button"
        >
          استخدم مثالًا لهذا النوع
        </button>
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-lg bg-cyan-700 px-4 py-2 text-white"
            href="/workspace/studio"
          >
            فتح استوديو مهام التوليد
          </Link>
          <button
            className="rounded-lg border px-4 py-2 disabled:opacity-50"
            disabled={!prompt.trim()}
            onClick={saveDraft}
            type="button"
          >
            حفظ الوصف محليًا
          </button>
          <button
            className="rounded-lg border px-4 py-2"
            onClick={restoreDraft}
            type="button"
          >
            استعادة الوصف
          </button>
          <button
            className="rounded-lg border px-4 py-2 disabled:opacity-50"
            disabled={!prompt.trim()}
            onClick={exportBrief}
            type="button"
          >
            تصدير وصف JSON
          </button>
          <button
            className="rounded-lg border px-4 py-2"
            onClick={() => {
              try {
                localStorage.removeItem(draftKey);
                setPrompt("");
                setError(null);
                setNotice("مُسحت المسودة المحلية.");
              } catch {
                setError("تعذّر مسح المسودة.");
              }
            }}
            type="button"
          >
            مسح المسودة
          </button>
        </div>
      </section>
      {error && (
        <p
          className="rounded-xl border border-red-500/40 bg-red-500/10 p-4"
          role="alert"
        >
          {error}
        </p>
      )}
      <p
        aria-live="polite"
        className="text-muted-foreground text-sm"
        role="status"
      >
        {notice}
      </p>
      <p className="text-muted-foreground text-sm">
        هذه مساحة لإعداد الوصف، وليست عارضًا ثلاثي الأبعاد. ميزات المعاينة
        والتوليد مرتبطة بتكامل مزود فعلي لاحقًا.
      </p>
    </main>
  );
}
