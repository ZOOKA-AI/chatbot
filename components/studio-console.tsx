"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The creative studio, Arabic first.
 *
 * Every button here calls a real endpoint that produces a real file: uploads land on disk, edits run
 * through ffmpeg, and a render comes back as an MP4 with a duration ffprobe measured. AI generation is
 * in its own tab and says plainly that it needs a connected provider, because it does.
 */

type Asset = {
  id: string;
  kind: "image" | "video" | "audio";
  source: "upload" | "derived";
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: string | null;
  status: string;
  label: string | null;
  parentAssetId: string | null;
  createdAt: string;
};

type Tab = "library" | "images" | "video" | "audio" | "ai";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "library", label: "مكتبة الوسائط" },
  { id: "images", label: "الصور" },
  { id: "video", label: "الفيديو" },
  { id: "audio", label: "الصوت" },
  { id: "ai", label: "توليد بالذكاء الاصطناعي" },
];

const SIZE_PRESETS = [
  { label: "ستوري 1080×1920", width: 1080, height: 1920 },
  { label: "مربع 1080×1080", width: 1080, height: 1080 },
  { label: "أفقي 1920×1080", width: 1920, height: 1080 },
];

function humanBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T;
  return { ok: response.ok, data };
}

export function StudioConsole() {
  const [tab, setTab] = useState<Tab>("library");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [usage, setUsage] = useState<{ assets: number; bytes: number }>({ assets: 0, bytes: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [logoId, setLogoId] = useState<string | null>(null);
  const [caption, setCaption] = useState("تقنية بإيمان، تقدم بأخلاق");
  const [aspect, setAspect] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [sceneSeconds, setSceneSeconds] = useState(2);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/studio/assets");
    const data = (await response.json().catch(() => ({}))) as { assets?: Asset[]; usage?: { assets: number; bytes: number } };
    if (response.ok) {
      setAssets(data.assets ?? []);
      setUsage(data.usage ?? { assets: 0, bytes: 0 });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const images = useMemo(() => assets.filter((asset) => asset.kind === "image" && asset.status === "ready"), [assets]);
  const videos = useMemo(() => assets.filter((asset) => asset.kind === "video"), [assets]);
  const audios = useMemo(() => assets.filter((asset) => asset.kind === "audio"), [assets]);

  const upload = async (file: File) => {
    setBusy(true);
    setNotice(null);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/studio/assets", { method: "POST", body: form });
    const data = (await response.json().catch(() => ({}))) as { asset?: Asset; error?: string; detail?: string };
    setBusy(false);
    if (!response.ok || !data.asset) {
      setNotice(`تعذّر الرفع: ${data.error ?? "سبب غير معروف"}${data.detail ? ` (${data.detail})` : ""}`);
      return;
    }
    setNotice(
      data.asset.status === "ready"
        ? `رُفع الملف وقرأناه: ${data.asset.width ?? "?"}×${data.asset.height ?? "?"} · ${humanBytes(data.asset.bytes)}`
        : "رُفع الملف لكن ffprobe لم يستطع قراءته، فسُجّل كملف غير صالح."
    );
    await load();
  };

  const edit = async (operation: Record<string, unknown>) => {
    if (!selectedImage) {
      setNotice("اختر صورة أولًا.");
      return;
    }
    setBusy(true);
    setNotice(null);
    const { ok, data } = await post<{ asset?: Asset; error?: string; detail?: string }>("/api/studio/edit", {
      kind: "image",
      assetId: selectedImage,
      operation,
    });
    setBusy(false);
    setNotice(ok ? `أُنجز التعديل: ${data.asset?.label ?? ""}` : `تعذّر التعديل: ${data.error ?? "سبب غير معروف"}${data.detail ? ` (${data.detail})` : ""}`);
    await load();
  };

  const render = async () => {
    if (images.length === 0) {
      setNotice("ارفع صورة واحدة على الأقل لتبني الفيديو.");
      return;
    }
    setBusy(true);
    setNotice(null);
    const { ok, data } = await post<{ asset?: Asset; error?: string; detail?: string }>("/api/studio/render", {
      aspect,
      scenes: images.slice(0, 6).map((asset) => ({ assetId: asset.id, seconds: sceneSeconds })),
    });
    setBusy(false);
    setNotice(
      ok
        ? `أُنتج فيديو حقيقي: ${data.asset?.width}×${data.asset?.height} · ${Number(data.asset?.durationSeconds ?? 0).toFixed(1)} ثانية · ${humanBytes(data.asset?.bytes ?? 0)}`
        : `تعذّر الإنتاج: ${data.error ?? "سبب غير معروف"}${data.detail ? ` (${data.detail})` : ""}`
    );
    await load();
    setTab("video");
  };

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-4 text-sm" style={{ color: "#F8F9FA" }}>
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">الاستوديو الإبداعي</h1>
        <p className="text-xs opacity-70">
          ملفاتك الحقيقية: نرفعها، نقيسها بـffprobe، نعدّلها بـffmpeg، ونعيدها إليك للتنزيل. لا شيء هنا
          صورة مُختلقة.
        </p>
        <p className="text-xs opacity-60">
          الأصول: {usage.assets} · الحجم: {humanBytes(usage.bytes)}
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className="rounded px-3 py-1.5 text-xs"
            style={{
              background: tab === entry.id ? "#2E86AB" : "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <section className="flex flex-wrap items-center gap-2 rounded border border-white/10 p-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/mp4"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
          className="text-xs"
        />
        <span className="text-xs opacity-60">صور · فيديو MP4/MOV · صوت</span>
      </section>

      {notice ? (
        <p className="rounded border border-white/10 px-3 py-2 text-xs" style={{ background: "rgba(162,59,114,0.15)" }}>
          {notice}
        </p>
      ) : null}

      {(tab === "library" || tab === "images") && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold opacity-70">الصور ({images.length})</h2>
          <div className="flex flex-wrap gap-3">
            {images.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setSelectedImage(asset.id)}
                className="flex w-40 flex-col gap-1 rounded border p-1 text-right"
                style={{
                  borderColor: selectedImage === asset.id ? "#2E86AB" : "rgba(255,255,255,0.15)",
                  background: selectedImage === asset.id ? "rgba(46,134,171,0.15)" : "transparent",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/studio/assets/${asset.id}/file`} alt={asset.label ?? "صورة"} className="h-24 w-full rounded object-cover" />
                <span className="text-[11px] opacity-80">
                  {asset.width}×{asset.height} · {humanBytes(asset.bytes)}
                </span>
                <span className="text-[11px] opacity-50">{asset.source === "upload" ? "أصلية" : `مشتقة: ${asset.label ?? ""}`}</span>
              </button>
            ))}
            {images.length === 0 ? <p className="text-xs opacity-60">لا صور بعد.</p> : null}
          </div>
        </section>
      )}

      {tab === "images" && (
        <section className="flex flex-col gap-2 rounded border border-white/10 p-3">
          <h2 className="text-xs font-semibold opacity-70">تعديل الصورة المختارة</h2>
          <div className="flex flex-wrap gap-2">
            {SIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={busy}
                onClick={() => edit({ op: "resize", width: preset.width, height: preset.height })}
                className="rounded border border-white/25 px-2 py-1 text-xs"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => edit({ op: "crop", width: 800, height: 800, x: 0, y: 0 })}
              className="rounded border border-white/25 px-2 py-1 text-xs"
            >
              قص 800×800
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              className="flex-1 rounded border border-white/20 bg-transparent px-2 py-1 text-xs"
              placeholder="نص للطباعة على الصورة"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => edit({ op: "text", text: caption, size: 64, color: "white", y: 40 })}
              className="rounded px-2 py-1 text-xs"
              style={{ background: "#A23B72" }}
            >
              طباعة النص
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={logoId ?? ""}
              onChange={(event) => setLogoId(event.target.value || null)}
              className="rounded border border-white/20 bg-transparent px-2 py-1 text-xs"
            >
              <option value="">اختر شعارًا من صورك</option>
              {images.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.label ?? asset.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !logoId}
              onClick={() => logoId && edit({ op: "logo", logoAssetId: logoId, scale: 0.2, corner: "br" })}
              className="rounded border border-white/25 px-2 py-1 text-xs"
            >
              إضافة الشعار
            </button>
          </div>
          {selectedImage ? (
            <a
              href={`/api/studio/assets/${selectedImage}/file?download=1`}
              className="text-xs underline opacity-80"
            >
              تنزيل الصورة المختارة
            </a>
          ) : null}
        </section>
      )}

      {tab === "video" && (
        <section className="flex flex-col gap-2 rounded border border-white/10 p-3">
          <h2 className="text-xs font-semibold opacity-70">إنتاج فيديو MP4 من صورك (ffmpeg)</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              المقاس
              <select
                value={aspect}
                onChange={(event) => setAspect(event.target.value as typeof aspect)}
                className="rounded border border-white/20 bg-transparent px-2 py-1"
              >
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              مدة كل مشهد (ثانية)
              <input
                type="number"
                min={1}
                max={10}
                value={sceneSeconds}
                onChange={(event) => setSceneSeconds(Number(event.target.value) || 2)}
                className="w-16 rounded border border-white/20 bg-transparent px-2 py-1"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={render}
              className="rounded px-3 py-1.5 text-xs"
              style={{ background: "#2E86AB" }}
            >
              أنتج الفيديو ({Math.min(images.length, 6)} مشاهد)
            </button>
          </div>
          <p className="text-[11px] opacity-60">
            يستخدم أول {Math.min(images.length, 6)} صورة من مكتبتك بالترتيب. الإنتاج حتمي ويستغرق ثوانٍ.
          </p>
          <div className="flex flex-wrap gap-3">
            {videos.map((asset) => (
              <div key={asset.id} className="flex w-56 flex-col gap-1 rounded border border-white/10 p-1">
                <video src={`/api/studio/assets/${asset.id}/file`} controls className="w-full rounded" />
                <span className="text-[11px] opacity-80">
                  {asset.width}×{asset.height} · {Number(asset.durationSeconds ?? 0).toFixed(1)}s · {humanBytes(asset.bytes)}
                </span>
                <a href={`/api/studio/assets/${asset.id}/file?download=1`} className="text-[11px] underline">
                  تنزيل MP4
                </a>
              </div>
            ))}
            {videos.length === 0 ? <p className="text-xs opacity-60">لا فيديو بعد.</p> : null}
          </div>
        </section>
      )}

      {tab === "audio" && (
        <section className="flex flex-col gap-2 rounded border border-white/10 p-3">
          <h2 className="text-xs font-semibold opacity-70">الصوت ({audios.length})</h2>
          <div className="flex flex-col gap-2">
            {audios.map((asset) => (
              <div key={asset.id} className="flex flex-wrap items-center gap-2 rounded border border-white/10 p-2">
                <audio src={`/api/studio/assets/${asset.id}/file`} controls className="h-8" />
                <span className="text-[11px] opacity-70">
                  {Number(asset.durationSeconds ?? 0).toFixed(1)}s · {humanBytes(asset.bytes)}
                </span>
                <a href={`/api/studio/assets/${asset.id}/file?download=1`} className="text-[11px] underline">
                  تنزيل
                </a>
              </div>
            ))}
            {audios.length === 0 ? (
              <p className="text-xs opacity-60">
                ارفع ملفًا صوتيًا لتعديله (قص وتطبيع مستوى الصوت). تحويل النص إلى كلام يحتاج مزوّدًا مربوطًا
                ولم يُفعَّل بعد.
              </p>
            ) : null}
          </div>
        </section>
      )}

      {tab === "ai" && (
        <section className="flex flex-col gap-2 rounded border border-white/10 p-3 text-xs">
          <h2 className="text-xs font-semibold opacity-70">توليد الصور بالذكاء الاصطناعي</h2>
          <p className="opacity-80">
            مسار التوليد موجود في المنصة لكنه يحتاج مزوّدًا مربوطًا (مفتاح نموذج صور أو عنوان محرك وسائط).
            غير مربوط الآن، لذلك لا يُعرض هنا زر يولّد صورة، لأن ذلك سيكون ادعاءً.
          </p>
          <p className="opacity-60">
            ما يعمل اليوم بلا أي مزوّد: الرفع، القياس، القص، التغيير الحجم، طباعة النص، تركيب الشعار، وإنتاج
            MP4 حقيقي.
          </p>
        </section>
      )}
    </div>
  );
}
