"use client";
import { ImagePlus, Info, Sparkles } from "lucide-react";
import NextImage from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { rasterSource, ratios } from "@/lib/creative/design";
import {
  type ImageOptions,
  imageOptionsSchema,
} from "@/lib/creative/image-options";
import styles from "./creative.module.css";

export function ImageGenerator({
  lang,
  onImage,
}: {
  lang: "ar" | "en";
  onImage: (source: string) => void;
}) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [configured, setConfigured] = useState(false);
  const [checked, setChecked] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<ImageOptions>(() =>
    imageOptionsSchema.parse({})
  );
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [asset, setAsset] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [videoConfigured, setVideoConfigured] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    fetch("/api/creative/capabilities", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive.current) {
          setConfigured(data?.image?.configured === true);
          setVideoConfigured(data?.video?.configured === true);
          setChecked(true);
        }
      })
      .catch(() => {
        if (alive.current) {
          setChecked(true);
        }
      });
    return () => {
      alive.current = false;
    };
  }, []);
  async function reference(file?: File) {
    if (
      !file ||
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 1_000_000
    ) {
      setMessage(
        t("مرجع PNG/JPEG حتى 1MB فقط.", "PNG/JPEG reference up to 1MB only.")
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      if (rasterSource.safeParse(value).success) {
        setOptions((current) => ({ ...current, reference: value }));
      }
    };
    reader.readAsDataURL(file);
  }
  async function generate() {
    if (!accepted || !prompt.trim() || busy) {
      return;
    }
    setBusy(true);
    setAsset(null);
    setJobId(null);
    setMessage(
      t(
        "جارٍ إرسال طلب واحد؛ لا تعِد الإرسال إن انقطع الاتصال.",
        "Submitting one request. Do not resend after an uncertain response."
      )
    );
    try {
      const response = await fetch("/api/media-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "IMAGE",
          prompt,
          imageOptions: options,
        }),
      });
      if (response.redirected) {
        throw new Error(t("سجّل الدخول أولاً.", "Sign in first."));
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Generation failed");
      }
      setJobId(data.jobId);
      const status = await fetch(
        `/api/media-engine?jobId=${encodeURIComponent(data.jobId)}`,
        { cache: "no-store" }
      );
      const result = await status.json();
      if (!status.ok) {
        throw new Error("Unable to read generation result");
      }
      if (
        result.status === "succeeded" &&
        typeof result.assetUrl === "string" &&
        result.assetUrl.startsWith("/api/files/")
      ) {
        setAsset(result.assetUrl);
        setMessage(
          t(
            "حُفظت الصورة في التخزين الخاص لمساحتك.",
            "Image saved to your workspace's private storage."
          )
        );
      } else {
        setMessage(
          t(
            "المهمة محفوظة ولم يثبت اكتمالها بعد. لا تُنشئ طلباً جديداً قبل مراجعة حالتها.",
            "Job is stored but not confirmed complete. Check its status before creating another request."
          )
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("فشل الطلب", "Request failed")
      );
    } finally {
      if (alive.current) {
        setBusy(false);
      }
    }
  }
  async function addGenerated() {
    if (!asset) {
      return;
    }
    try {
      const response = await fetch(asset);
      if (!response.ok) {
        throw new Error("Unable to load generated asset");
      }
      const blob = await response.blob();
      if (blob.size > 10_000_000) {
        throw new Error("Unable to load generated asset");
      }
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      const factor = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * factor);
      canvas.height = Math.round(bitmap.height * factor);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Unable to load generated asset");
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const source = canvas.toDataURL("image/jpeg", 0.8);
      rasterSource.parse(source);
      onImage(source);
      setMessage(
        t(
          "أُضيفت نسخة معاينة مضغوطة للتصميم؛ الأصل يبقى في التخزين الخاص.",
          "A compressed preview was added to the design; the original remains in private storage."
        )
      );
    } catch {
      setMessage(
        t(
          "تعذرت الإضافة. حمّل الصورة الأصلية من رابطها.",
          "Could not add image. Download the original from its link."
        )
      );
    }
  }
  return (
    <section className={styles.section} id="image-generation">
      <h2>
        <Sparkles size={24} /> {t("مولد الصور", "AI image generation")}
      </h2>
      <p className={styles.warning}>
        {checked
          ? configured
            ? t(
                "CONFIGURED — إعداد موجود، لا يعني نجاح اختبار حي. يتطلب مالك مساحة مسجلاً وثلاث محاولات يومياً كحد أقصى.",
                "CONFIGURED — settings exist, not a live verification. Requires a signed-in workspace owner; three attempts per day maximum."
              )
            : t(
                "NOT CONFIGURED — التوليد غير مفعّل لهذا المحرك. المحرر والقوالب يظلان متاحين.",
                "NOT CONFIGURED — this image engine is not enabled. Editor/templates remain available."
              )
          : t("جارٍ فحص الإعداد…", "Checking configuration…")}
      </p>
      <div className={styles.form}>
        <label className={styles.field}>
          {t("وصف الصورة", "Image description")}
          <textarea
            maxLength={2000}
            onChange={(e) => setPrompt(e.target.value)}
            value={prompt}
          />
        </label>
        <label className={styles.field}>
          {t("نوع التصميم", "Design purpose")}
          <select
            onChange={(e) =>
              setOptions({
                ...options,
                purpose: e.target.value as ImageOptions["purpose"],
              })
            }
            value={options.purpose}
          >
            {[
              "advertisement",
              "product",
              "story",
              "thumbnail",
              "infographic",
              "brand",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {t("نسبة الأبعاد", "Aspect ratio")}
          <select
            onChange={(e) =>
              setOptions({
                ...options,
                ratio: e.target.value as ImageOptions["ratio"],
              })
            }
            value={options.ratio}
          >
            {Object.keys(ratios).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {t("الأسلوب", "Style")}
          <select
            onChange={(e) =>
              setOptions({
                ...options,
                style: e.target.value as ImageOptions["style"],
              })
            }
            value={options.style}
          >
            {["photographic", "illustration", "3d-look", "minimal"].map(
              (value) => (
                <option key={value}>{value}</option>
              )
            )}
          </select>
        </label>
        {(
          [
            ["palette", t("الألوان", "Palette")],
            ["lighting", t("الإضاءة", "Lighting")],
            ["camera", t("زاوية الكاميرا", "Camera")],
            ["background", t("الخلفية", "Background")],
            ["text", t("نص داخل الصورة", "Lettering")],
          ] as const
        ).map(([key, label]) => (
          <label className={styles.field} key={key}>
            {label}
            <input
              maxLength={key === "text" ? 200 : 100}
              onChange={(e) =>
                setOptions({ ...options, [key]: e.target.value })
              }
              value={options[key]}
            />
          </label>
        ))}
        <label>
          {t("لغة النص", "Language")}
          <select
            onChange={(e) =>
              setOptions({
                ...options,
                language: e.target.value as "ar" | "en",
              })
            }
            value={options.language}
          >
            <option>ar</option>
            <option>en</option>
          </select>
        </label>
        <label className={styles.field}>
          <ImagePlus size={16} />
          {t(
            "مرجع اختياري (سيُرسل للمزوّد)",
            "Optional reference (sent to provider)"
          )}
          <input
            accept="image/png,image/jpeg"
            onChange={(e) => {
              reference(e.target.files?.[0]);
              e.target.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      {options.reference && (
        <button
          onClick={() => setOptions({ ...options, reference: undefined })}
          type="button"
        >
          {t("إزالة المرجع من الطلب", "Remove request reference")}
        </button>
      )}
      <details>
        <summary>
          <Info size={14} />{" "}
          {t("المتطلبات والحدود والتكلفة", "Requirements, limits and cost")}
        </summary>
        <p>
          {t(
            "النموذج bfl/flux-2-pro؛ صورة واحدة لكل طلب، دون إعادة تلقائية. المحاولة الفاشلة تُحسب من الحد اليومي وقد يحتسب المزوّد تكلفة. الأبعاد والنصوص والهوية أفضليات وليست ضماناً. 3d-look صورة مسطحة وليست ملفاً ثلاثي الأبعاد. إزالة الخلفية والأقنعة والفيديو ليست متاحة بهذا المسار. يتطلب قاعدة البيانات والتخزين الخاص واتصال مزوّد صالحاً. لا ترفع صوراً ليس لك حق استخدامها.",
            "Model bfl/flux-2-pro; one output/request, no automatic retries. Failed attempts count and may incur provider costs. Dimensions, lettering and brand adherence are preferences, not guarantees. 3d-look is a flat image, not a 3D file. Background removal, masks and video are not supported in this path. Requires working database/private storage/provider access. Upload only images you may lawfully use."
          )}
        </p>
        <a
          href="https://vercel.com/docs/ai-gateway/modalities/image-generation/ai-sdk"
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("توثيق المزوّد", "Provider documentation")}
        </a>
      </details>
      <label className={styles.field}>
        <span>
          <input
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            style={{ width: "auto" }}
            type="checkbox"
          />
          {t(
            "أوافق على إرسال الوصف والمرجع وعلى احتمال تكلفة الطلب.",
            "I approve sending the prompt/reference and potential request cost."
          )}
        </span>
      </label>
      <div className={styles.tools}>
        <button
          disabled={!configured || !accepted || !prompt.trim() || busy}
          onClick={() => generate()}
          type="button"
        >
          <Sparkles size={16} />
          {busy
            ? t("جارٍ التنفيذ…", "Generating…")
            : t("توليد صورة واحدة", "Generate one image")}
        </button>
        <Link className={styles.link} href="/login">
          {t("تسجيل الدخول", "Sign in")}
        </Link>
      </div>
      <p role="status">{message}</p>
      {jobId && <p className={styles.help}>Job: {jobId}</p>}
      {asset && (
        <div className={styles.panel}>
          <NextImage
            alt={t("نتيجة التوليد الفعلية", "Actual generated image")}
            height={1024}
            src={asset}
            style={{ maxHeight: 400, objectFit: "contain" }}
            unoptimized
            width={1024}
          />
          <div className={styles.tools}>
            <button onClick={() => addGenerated()} type="button">
              {t("إضافة للتصميم", "Add to design")}
            </button>
            <a className={styles.link} download href={asset}>
              {t("فتح الأصل الخاص", "Open private original")}
            </a>
          </div>
        </div>
      )}
      <section className={styles.section}>
        <h2>AI VIDEO STUDIO</h2>
        <p>
          {videoConfigured
            ? t(
                "عامل فيديو خارجي مُعدّ، ولم يُختبر هنا. استخدم مسار مهام الوسائط الحالي من حسابك بعد التحقق من قدراته.",
                "An external video worker is configured but unverified here. Use the existing workspace media job flow after verifying its capabilities."
              )
            : t(
                "NOT CONFIGURED — لا يوجد محرك فيديو متحقق منه. لا توليد أو موسيقى مرخصة أو نشر فيديو تلقائي هنا.",
                "NOT CONFIGURED — no verified video engine. No video generation, licensed music, or automatic video publishing here."
              )}
        </p>
        <Link className={styles.link} href="/workspace/studio">
          {t("مهام الوسائط الحالية", "Existing media jobs")}
        </Link>
      </section>
    </section>
  );
}
