"use client";

import {
  Copy,
  Download,
  ImagePlus,
  Layers,
  Moon,
  Move,
  Plus,
  Redo2,
  Save,
  Star,
  Sun,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import NextImage from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  categoryNames,
  type Design,
  designSchema,
  designSvg,
  fonts,
  type Layer,
  loadDesigns,
  newLayer,
  rasterSource,
  ratios,
  templateDesign,
} from "@/lib/creative/design";
import styles from "./creative.module.css";
import { ImageGenerator } from "./image-generator";
import { WorkspaceOverview } from "./workspace-overview";

const storageKey = "zooka-creative-designs-v1";
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DesignStudio() {
  const { resolvedTheme, setTheme } = useTheme();
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const t = useCallback(
    (ar: string, en: string) => (lang === "ar" ? ar : en),
    [lang]
  );
  const [design, setDesign] = useState<Design>(() => templateDesign(0));
  const [saved, setSaved] = useState<Design[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, select] = useState<string | null>("title");
  const [past, setPast] = useState<Design[]>([]);
  const [future, setFuture] = useState<Design[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState(false);
  const stage = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    original: Design;
  } | null>(null);
  const clipboard = useRef<Layer | null>(null);
  const lastSaved = useRef<string>("");
  const layer = design.layers.find((item) => item.id === selected);
  useEffect(() => {
    try {
      const projects = loadDesigns(localStorage.getItem(storageKey));
      setSaved(projects);
      if (projects[0]) {
        setDesign(projects[0]);
      }
      const value: unknown = JSON.parse(
        localStorage.getItem(`${storageKey}-favorites`) ?? "[]"
      );
      if (Array.isArray(value)) {
        setFavorites(
          value.filter(
            (n) => Number.isInteger(n) && n >= 0 && n < categoryNames.length
          )
        );
      }
    } catch {
      setNotice("التخزين المحلي غير متاح / Browser storage unavailable");
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || (!lastSaved.current && design.id.startsWith("template-"))) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        const valid = designSchema.parse({
          ...design,
          updatedAt: new Date().toISOString(),
        });
        const projects = [
          valid,
          ...loadDesigns(localStorage.getItem(storageKey)).filter(
            (p) => p.id !== valid.id
          ),
        ].slice(0, 12);
        const json = JSON.stringify(projects);
        if (json.length > 4_000_000) {
          throw new Error("storage limit");
        }
        localStorage.setItem(storageKey, json);
        setSaved(projects);
        lastSaved.current = valid.id;
        setNotice(
          t("حُفظ التصميم على هذا المتصفح فقط.", "Saved on this browser only.")
        );
      } catch {
        setNotice(
          t(
            "تعذّر الحفظ: صدّر JSON لحماية عملك أو قلل الصور.",
            "Save failed: export JSON to protect your work or reduce images."
          )
        );
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [design, ready, t]);
  function change(next: Design) {
    const result = designSchema.safeParse(next);
    if (!result.success) {
      setNotice(
        t(
          "قيمة غير صالحة أو حد الطبقات تجاوز 40.",
          "Invalid value or more than 40 layers."
        )
      );
      return;
    }
    setPast((items) => [...items.slice(-19), design]);
    setFuture([]);
    if (result.data.id.startsWith("template-")) {
      result.data.id = crypto.randomUUID();
    }
    lastSaved.current = result.data.id;
    setDesign(result.data);
  }
  function patch(values: Partial<Layer>) {
    if (layer) {
      change({
        ...design,
        layers: design.layers.map((l) =>
          l.id === layer.id ? { ...l, ...values } : l
        ),
      });
    }
  }
  function undo() {
    const value = past.at(-1);
    if (value) {
      setFuture((items) => [design, ...items].slice(0, 20));
      setPast(past.slice(0, -1));
      setDesign(value);
    }
  }
  function redo() {
    const value = future[0];
    if (value) {
      setPast([...past, design]);
      setFuture(future.slice(1));
      setDesign(value);
    }
  }
  function add(kind: Layer["kind"], source?: string) {
    const item = {
      ...newLayer(kind),
      ...(source ? { source, width: 500, height: 500 } : {}),
    };
    change({ ...design, layers: [...design.layers, item] });
    select(item.id);
  }
  function duplicate() {
    if (layer) {
      const copy = {
        ...layer,
        id: crypto.randomUUID(),
        x: layer.x + 20,
        y: layer.y + 20,
      };
      change({ ...design, layers: [...design.layers, copy] });
      select(copy.id);
    }
  }
  function moveLayer(offset: number) {
    if (!layer) {
      return;
    }
    const items = [...design.layers];
    const index = items.findIndex((l) => l.id === layer.id);
    const target = index + offset;
    if (target < 0 || target >= items.length) {
      return;
    }
    [items[index], items[target]] = [items[target], items[index]];
    change({ ...design, layers: items });
  }
  async function importImage(file?: File) {
    if (
      !file ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 1_000_000
    ) {
      setNotice(
        t(
          "اختر PNG/JPEG/WebP حتى 1MB، لا SVG.",
          "Choose PNG/JPEG/WebP up to 1 MB, not SVG."
        )
      );
      return;
    }
    try {
      const reader = new FileReader();
      const source = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      rasterSource.parse(source);
      const img = new Image();
      img.src = source;
      await img.decode();
      if (img.naturalWidth * img.naturalHeight > 16_000_000) {
        throw new Error("image too large");
      }
      add("image", source);
    } catch {
      setNotice(t("تعذّر قراءة الصورة.", "Image could not be decoded."));
    }
  }
  async function importDesign(file?: File) {
    try {
      if (!file || file.size > 4_000_000) {
        throw new Error("large");
      }
      const value = designSchema.parse(JSON.parse(await file.text()));
      change({ ...value, id: crypto.randomUUID() });
    } catch {
      setNotice(
        t(
          "ملف تصميم غير صالح. يقبل JSON صادر من هذا المحرر فقط.",
          "Invalid design. Use JSON exported by this editor."
        )
      );
    }
  }
  async function exportPng() {
    try {
      const url = URL.createObjectURL(
        new Blob([designSvg(design)], { type: "image/svg+xml" })
      );
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = design.width;
        canvas.height = design.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("canvas");
        }
        ctx.drawImage(image, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject()),
            "image/png"
          )
        );
        download(blob, "zooka-design.png");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setNotice(
        t(
          "فشل تصدير PNG. جرّب SVG، وقد تختلف الخطوط المتوفرة على جهازك.",
          "PNG export failed. Try SVG; available fonts may differ by device."
        )
      );
    }
  }
  const numberField = (
    label: string,
    key: "x" | "y" | "width" | "height" | "rotation" | "fontSize" | "opacity",
    step = 1
  ) => (
    <label className={styles.field}>
      {label}
      <input
        aria-label={label}
        onChange={(event) => patch({ [key]: Number(event.target.value) })}
        step={step}
        type="number"
        value={layer?.[key] ?? 0}
      />
    </label>
  );
  return (
    <main
      className={styles.root}
      data-color-mode={resolvedTheme}
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
    >
      <header className={styles.header}>
        <div>
          <p>Innovate • Automate • Grow</p>
          <h1>ZOOKA AI CREATIVE STUDIO</h1>
          <p>
            {t(
              "تقنية بإيمان، تقدم بأخلاق.",
              "Technology with faith. Progress with ethics."
            )}
          </p>
        </div>
        <nav className={styles.nav}>
          <Link className={styles.link} href="/studio">
            Studio
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
          <button
            aria-label="Toggle theme"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            type="button"
          >
            {resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </nav>
      </header>
      <p className={styles.warning}>
        {t(
          "المحرر يعمل فعلياً على جهازك. الحفظ محلي وغير مشفّر وغير مرتبط بحساب؛ لا تحفظ أسراراً على جهاز مشترك. لا يوجد نشر اجتماعي تلقائي هنا.",
          "This editor runs on your device. Saves are local, unencrypted and not account-bound. Do not save secrets on a shared device. No automatic social publishing here."
        )}
      </p>
      <details>
        <summary>
          ⓘ {t("دليل البداية والخصوصية", "Quick start and privacy")}
        </summary>
        <p>
          {t(
            "اختر قالباً، اضغط عنصراً، حرّكه أو عدّل خصائصه، ثم صدّر PNG أو SVG أو نسخة JSON. الخطوط تعتمد على ما هو مثبّت على جهازك، ولا تُحمّل من طرف خارجي. الحفظ التلقائي حتى 12 تصميماً و4MB؛ صدّر نسخك المهمة. الصور المرجعية تُرسل للمزوّد فقط عند الضغط الصريح على توليد.",
            "Choose a template, select a layer, drag it or edit its properties, then export PNG, SVG or JSON. Fonts depend on your device and are not downloaded externally. Autosave holds up to 12 designs / 4 MB; export important work. Reference images leave the browser only after an explicit generation action."
          )}
        </p>
      </details>
      <p className={styles.notice} role="status">
        {notice ||
          t(
            "جاهز للتحرير — لم تُجرَ أي عملية مدفوعة.",
            "Ready to edit — no paid operation performed."
          )}
      </p>
      <div className={styles.tools}>
        <button disabled={!past.length} onClick={undo} type="button">
          <Undo2 size={16} />
          {t("تراجع", "Undo")}
        </button>
        <button disabled={!future.length} onClick={redo} type="button">
          <Redo2 size={16} />
          {t("إعادة", "Redo")}
        </button>
        <button
          onClick={() => {
            change({
              ...design,
              id: crypto.randomUUID(),
              name: `${design.name} copy`,
            });
          }}
          type="button"
        >
          <Copy size={16} />
          {t("نسخة تصميم", "Duplicate design")}
        </button>
        <button
          onClick={() =>
            change({ ...design, updatedAt: new Date().toISOString() })
          }
          type="button"
        >
          <Save size={16} />
          {t("حفظ محلي", "Save locally")}
        </button>
        <button onClick={() => setPreview(!preview)} type="button">
          {t("معاينة", "Preview")}
        </button>
        <button
          onClick={() =>
            download(
              new Blob([designSvg(design)], { type: "image/svg+xml" }),
              "zooka-design.svg"
            )
          }
          type="button"
        >
          <Download size={16} />
          SVG
        </button>
        <button onClick={exportPng} type="button">
          PNG
        </button>
        <button
          onClick={() =>
            download(
              new Blob([JSON.stringify(design)], { type: "application/json" }),
              "zooka-design.json"
            )
          }
          type="button"
        >
          JSON
        </button>
        <label className={styles.field}>
          {t("استيراد تصميم", "Import design")}
          <input
            accept="application/json"
            onChange={(e) => {
              importDesign(e.target.files?.[0]);
              e.target.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      <div className={styles.grid}>
        <aside className={styles.panel}>
          <h2>
            <Layers size={18} /> {t("الطبقات", "Layers")}
          </h2>
          <div className={styles.tools}>
            <button onClick={() => add("text")} type="button">
              <Type size={15} />
              {t("نص", "Text")}
            </button>
            <button onClick={() => add("rect")} type="button">
              <Plus size={15} />
              {t("مستطيل", "Rectangle")}
            </button>
            <button onClick={() => add("ellipse")} type="button">
              {t("دائرة", "Ellipse")}
            </button>
          </div>
          <label className={styles.field}>
            <ImagePlus size={16} />
            {t("صورة أو شعار", "Image or logo")}
            <input
              accept="image/png,image/jpeg,image/webp"
              id="creative-image-upload"
              onChange={(e) => {
                importImage(e.target.files?.[0]);
                e.target.value = "";
              }}
              type="file"
            />
          </label>
          {[...design.layers].reverse().map((item) => (
            <button
              className={selected === item.id ? styles.active : ""}
              key={item.id}
              onClick={() => select(item.id)}
              type="button"
            >
              {item.kind} · {item.text.slice(0, 18)}
            </button>
          ))}
          <label className={styles.field}>
            {t("مشاريعي المحلية", "Local projects")}
            <select
              onChange={(e) => {
                const value = saved.find((p) => p.id === e.target.value);
                if (value) {
                  setDesign(value);
                  setPast([]);
                  setFuture([]);
                  lastSaved.current = value.id;
                }
              }}
              value=""
            >
              <option value="">{t("اختر مشروعاً", "Choose a project")}</option>
              {saved.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </aside>
        <button
          aria-label={t(
            "منطقة إسقاط الصور. يمكن استخدام حقل رفع الصورة بدلاً منها.",
            "Image drop zone. The upload field is a keyboard-accessible alternative."
          )}
          className={styles.canvas}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            importImage(event.dataTransfer.files?.[0]);
          }}
          onKeyDown={(event) => {
            if (
              event.target === event.currentTarget &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              document.getElementById("creative-image-upload")?.click();
            }
          }}
          type="button"
        >
          <svg
            aria-label={t("لوحة التصميم", "Design canvas")}
            height={design.height}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onPointerMove={(event) => {
              const current = drag.current;
              const bounds = stage.current?.getBoundingClientRect();
              if (!current || !bounds) {
                return;
              }
              const x = Math.max(
                -2000,
                Math.min(
                  4000,
                  current.x +
                    ((event.clientX - current.startX) * design.width) /
                      bounds.width
                )
              );
              const y = Math.max(
                -2000,
                Math.min(
                  4000,
                  current.y +
                    ((event.clientY - current.startY) * design.height) /
                      bounds.height
                )
              );
              setDesign((value) => ({
                ...value,
                layers: value.layers.map((item) =>
                  item.id === current.id ? { ...item, x, y } : item
                ),
              }));
            }}
            onPointerUp={() => {
              if (drag.current) {
                const original = drag.current.original;
                setPast((items) => [...items.slice(-19), original]);
                setFuture([]);
                const id = design.id.startsWith("template-")
                  ? crypto.randomUUID()
                  : design.id;
                lastSaved.current = id;
                setDesign((value) => ({
                  ...value,
                  id,
                  updatedAt: new Date().toISOString(),
                }));
                drag.current = null;
              }
            }}
            ref={stage}
            role="img"
            viewBox={`0 0 ${design.width} ${design.height}`}
            width={design.width}
          >
            <rect fill={design.background} height="100%" width="100%" />
            {design.layers.map((item) => (
              <g
                key={item.id}
                onPointerDown={(event) => {
                  if (preview) {
                    return;
                  }
                  event.currentTarget.setPointerCapture(event.pointerId);
                  select(item.id);
                  drag.current = {
                    id: item.id,
                    startX: event.clientX,
                    startY: event.clientY,
                    x: item.x,
                    y: item.y,
                    original: design,
                  };
                }}
                opacity={item.opacity}
                style={{ cursor: preview ? "default" : "move" }}
                transform={`rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})`}
              >
                {item.kind === "rect" ? (
                  <rect
                    fill={item.fill}
                    height={item.height}
                    width={item.width}
                    x={item.x}
                    y={item.y}
                  />
                ) : item.kind === "ellipse" ? (
                  <ellipse
                    cx={item.x + item.width / 2}
                    cy={item.y + item.height / 2}
                    fill={item.fill}
                    rx={item.width / 2}
                    ry={item.height / 2}
                  />
                ) : item.kind === "image" ? (
                  <image
                    height={item.height}
                    href={item.source}
                    preserveAspectRatio="xMidYMid meet"
                    width={item.width}
                    x={item.x}
                    y={item.y}
                  />
                ) : (
                  <text
                    direction={item.direction}
                    fill={item.fill}
                    fontFamily={item.font}
                    fontSize={item.fontSize}
                    x={item.direction === "rtl" ? item.x + item.width : item.x}
                    y={item.y + item.fontSize}
                  >
                    {item.text}
                  </text>
                )}
                {!preview && item.id === selected && (
                  <rect
                    fill="none"
                    height={item.height}
                    stroke="#A23B72"
                    strokeDasharray="12 8"
                    strokeWidth="4"
                    width={item.width}
                    x={item.x}
                    y={item.y}
                  />
                )}
              </g>
            ))}
          </svg>
        </button>
        <aside className={styles.panel}>
          <h2>
            <Move size={18} />
            {t("الخصائص", "Properties")}
          </h2>
          <label className={styles.field}>
            {t("اسم التصميم", "Design name")}
            <input
              maxLength={100}
              onChange={(e) => {
                if (e.target.value.trim()) {
                  change({ ...design, name: e.target.value });
                }
              }}
              value={design.name}
            />
          </label>
          <label className={styles.field}>
            {t("نسبة التصميم", "Canvas ratio")}
            <select
              defaultValue="1:1"
              onChange={(e) => {
                const [width, height] =
                  ratios[e.target.value as keyof typeof ratios];
                change({ ...design, width, height });
              }}
            >
              {Object.keys(ratios).map((ratio) => (
                <option key={ratio}>{ratio}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            {t("لون الخلفية", "Background color")}
            <input
              onChange={(e) =>
                change({ ...design, background: e.target.value })
              }
              type="color"
              value={design.background}
            />
          </label>
          {layer && (
            <>
              <div className={styles.two}>
                {numberField("X", "x")}
                {numberField("Y", "y")}
                {numberField(t("العرض", "Width"), "width")}
                {numberField(t("الارتفاع", "Height"), "height")}
                {numberField(t("الدوران", "Rotation"), "rotation")}
                {numberField(t("الشفافية 0–1", "Opacity 0–1"), "opacity", 0.1)}
              </div>
              <label className={styles.field}>
                {t("لون العنصر", "Layer color")}
                <input
                  onChange={(e) => patch({ fill: e.target.value })}
                  type="color"
                  value={layer.fill}
                />
              </label>
              {layer.kind === "text" && (
                <>
                  <label className={styles.field}>
                    {t("النص", "Text content")}
                    <textarea
                      aria-label={t("النص", "Text content")}
                      maxLength={500}
                      onChange={(e) => patch({ text: e.target.value })}
                      value={layer.text}
                    />
                  </label>
                  <label className={styles.field}>
                    {t("الخط", "Font")}
                    <select
                      onChange={(e) =>
                        patch({ font: e.target.value as Layer["font"] })
                      }
                      value={layer.font}
                    >
                      {fonts.map((font) => (
                        <option key={font}>{font}</option>
                      ))}
                    </select>
                  </label>
                  {numberField(t("حجم الخط", "Font size"), "fontSize")}
                  <label>
                    {t("اتجاه النص", "Text direction")}
                    <select
                      onChange={(e) =>
                        patch({ direction: e.target.value as "rtl" | "ltr" })
                      }
                      value={layer.direction}
                    >
                      <option>rtl</option>
                      <option>ltr</option>
                    </select>
                  </label>
                </>
              )}
              <div className={styles.tools}>
                <button onClick={duplicate} type="button">
                  {t("استنساخ عنصر", "Duplicate layer")}
                </button>
                <button
                  onClick={() => {
                    clipboard.current = layer;
                    setNotice(
                      t("نُسخ العنصر داخلياً.", "Layer copied internally.")
                    );
                  }}
                  type="button"
                >
                  {t("نسخ", "Copy")}
                </button>
                <button
                  onClick={() => {
                    if (clipboard.current) {
                      change({
                        ...design,
                        layers: [
                          ...design.layers,
                          { ...clipboard.current, id: crypto.randomUUID() },
                        ],
                      });
                    }
                  }}
                  type="button"
                >
                  {t("لصق", "Paste")}
                </button>
                <button onClick={() => moveLayer(1)} type="button">
                  {t("للأمام", "Forward")}
                </button>
                <button onClick={() => moveLayer(-1)} type="button">
                  {t("للخلف", "Backward")}
                </button>
                <button
                  onClick={() => {
                    change({
                      ...design,
                      layers: design.layers.filter((l) => l.id !== layer.id),
                    });
                    select(null);
                  }}
                  type="button"
                >
                  <Trash2 size={15} />
                  {t("حذف عنصر", "Remove layer")}
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
      <section className={styles.section}>
        <h2>
          {t("مكتبة القوالب القابلة للتحرير", "Editable template library")}
        </h2>
        <p>
          {t(
            "قوالب أصلية داخل المحرر؛ ليست صوراً مولدة أو إعلانات منشورة. اختر نسخة وابدأ التعديل.",
            "Original editor templates, not generated assets or published ads. Start with a copy."
          )}
        </p>
        <input
          aria-label={t("بحث القوالب", "Search templates")}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("ابحث في القوالب", "Search templates")}
          value={filter}
        />
        <div className={styles.templates}>
          {categoryNames
            .map((name, index) => ({ name, index }))
            .filter(({ name }) => name.includes(filter))
            .map(({ name, index }) => (
              <article className={styles.panel} key={name}>
                <NextImage
                  alt={`${name} template preview`}
                  className={styles.preview}
                  height={1080}
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(designSvg(templateDesign(index)))}`}
                  unoptimized
                  width={1080}
                />
                <h3>{name}</h3>
                <p className={styles.help}>
                  1080 × 1080 ·{" "}
                  {t("نص وأشكال قابلة للتعديل", "Editable text and shapes")}
                </p>
                <button
                  onClick={() => {
                    change({
                      ...templateDesign(index),
                      id: crypto.randomUUID(),
                    });
                    select("title");
                  }}
                  type="button"
                >
                  {t("استخدم وعدّل نسخة", "Use editable copy")}
                </button>
                <button
                  aria-pressed={favorites.includes(index)}
                  onClick={() => {
                    const next = favorites.includes(index)
                      ? favorites.filter((i) => i !== index)
                      : [...favorites, index];
                    setFavorites(next);
                    try {
                      localStorage.setItem(
                        `${storageKey}-favorites`,
                        JSON.stringify(next)
                      );
                    } catch {
                      setNotice("Favorites could not be saved");
                    }
                  }}
                  type="button"
                >
                  <Star size={15} />
                  {favorites.includes(index)
                    ? t("بالمفضلة", "Favorited")
                    : t("مفضلة", "Favorite")}
                </button>
              </article>
            ))}
        </div>
      </section>
      <WorkspaceOverview lang={lang} />
      <ImageGenerator lang={lang} onImage={(source) => add("image", source)} />
    </main>
  );
}
