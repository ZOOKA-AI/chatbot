"use client";

import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";

/**
 * The approved ZOOKA-AI v2 intro, rendered by scripts/brand/render_intro.py with
 * RAQM shaping so the Arabic slogan joins correctly.
 *
 * Deliberate choices:
 * - no autoplay: 5 seconds of motion nobody asked for, and it would download
 *   160KB on every landing visit; `preload="metadata"` keeps the first paint light
 * - the poster is a real frame of the same clip, so the card never jumps
 * - controls stay visible for keyboard and screen-reader users
 * - playsInline keeps iOS from hijacking the screen with its native player
 * - if the file fails to load the poster and a plain link remain, so the card is
 *   never an empty black rectangle. The source is set on the <video> itself, not
 *   on a <source> child: a media error on a <source> does not bubble, so the
 *   fallback never fired and a missing file left a dead black player
 */

const VIDEO_SRC = "/videos/brand/zk-intro-1080x1920.mp4";
const POSTER_SRC = "/videos/brand/zk-intro-poster.jpg";

const COPY = {
  ar: {
    eyebrow: "هوية ZOOKA-AI v2",
    title: "تقنية بإيمان، تقدّم بأخلاق",
    body: "خمس ثوانٍ من الهوية المعتمدة: السداسي الرسمي، وتدرّج #2E86AB إلى #A23B72، والخط العربي مشكَّل بشكل صحيح.",
    play: "شغّل المقطع",
    fallback: "تعذّر تشغيل المقطع على هذا الجهاز.",
    open: "افتح الملف مباشرة",
    label: "مقطع تعريفي قصير بهوية ZOOKA-AI الرسمية",
  },
  en: {
    eyebrow: "ZOOKA-AI identity v2",
    title: "Technology with faith, progress with ethics",
    body: "Five seconds of the approved identity: the official hexagon, the #2E86AB to #A23B72 gradient, and correctly shaped Arabic type.",
    play: "Play the clip",
    fallback: "This device could not play the clip.",
    open: "Open the file directly",
    label: "Short brand intro clip for the official ZOOKA-AI identity",
  },
} as const;

export function BrandIntro({ lang }: { lang: Lang }) {
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isArabic = lang === "ar";
  const copy = isArabic ? COPY.ar : COPY.en;

  // The load error can fire before React hydrates, so an onError listener alone
  // misses it. Measured in Chromium: with the file blocked the element carried
  // MEDIA_ERR_SRC_NOT_SUPPORTED while the fallback never appeared.
  useEffect(() => {
    if (videoRef.current?.error) setFailed(true);
  }, []);

  return (
    <figure className="m-0 flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
      <div className="mx-auto w-full max-w-[260px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] shadow-[0_20px_60px_-20px_rgba(16,212,255,0.35)] md:mx-0">
        {failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- the poster is a still frame, not a layout image
          <img
            alt={copy.label}
            className="h-auto w-full"
            height={960}
            src={POSTER_SRC}
            width={540}
          />
        ) : (
          <video
            aria-label={copy.label}
            className="h-auto w-full"
            controls
            controlsList="nodownload"
            height={1920}
            onError={() => setFailed(true)}
            playsInline
            poster={POSTER_SRC}
            preload="metadata"
            ref={videoRef}
            src={VIDEO_SRC}
            width={1080}
          />
        )}
      </div>

      <figcaption className="flex flex-col gap-3">
        <span className="w-fit rounded-full border border-white/15 px-3 py-1 text-xs text-white/60">
          {copy.eyebrow}
        </span>
        <h2 className="font-semibold text-2xl leading-snug md:text-3xl">
          {copy.title}
        </h2>
        <p className="max-w-md text-sm text-white/70">{copy.body}</p>
        <p className="text-xs text-white/45">
          {failed ? `${copy.fallback} ` : ""}
          <a
            className="underline underline-offset-4 hover:text-white/70"
            href={VIDEO_SRC}
            rel="noreferrer"
            target="_blank"
          >
            {copy.open}
          </a>
        </p>
      </figcaption>
    </figure>
  );
}
