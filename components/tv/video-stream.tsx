"use client";

import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, type TvVideo } from "@/lib/tv/videos";

type Lang = "ar" | "en";

/**
 * ZOOKA VIDEO STREAM — a horizontal strip of video cards.
 *
 * - Desktop: arrow buttons + gentle auto-advance (one card every 6s).
 * - Phone: native swipe via scroll-snap.
 * - Auto-advance pauses on hover, on keyboard focus, when the tab is hidden,
 *   and never runs under prefers-reduced-motion.
 * - Cards show posters only; no video element loads until someone opens one,
 *   and nothing ever plays with sound on its own.
 */
export function VideoStream({
  videos,
  lang,
  hrefFor = (video) => `/tv?v=${video.id}`,
  showDraftBadge = true,
}: {
  videos: TvVideo[];
  lang: Lang;
  hrefFor?: (video: TvVideo) => string;
  showDraftBadge?: boolean;
}) {
  const ar = lang === "ar";
  const track = useRef<HTMLUListElement>(null);
  const [paused, setPaused] = useState(false);

  const step = useCallback(
    (direction: 1 | -1) => {
      const el = track.current;
      if (!el) {
        return;
      }
      const card = el.querySelector<HTMLElement>("li");
      const width = (card?.offsetWidth ?? 280) + 16;
      // In RTL, scrollLeft runs negative; "next" means further along the
      // reading direction in both cases.
      const sign = ar ? -1 : 1;
      const max = el.scrollWidth - el.clientWidth;
      const atEnd = Math.abs(el.scrollLeft) >= max - 4;
      if (direction === 1 && atEnd) {
        el.scrollTo({ left: 0, behavior: "smooth" });
        return;
      }
      el.scrollBy({ left: sign * direction * width, behavior: "smooth" });
    },
    [ar]
  );

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || paused || videos.length < 2) {
      return;
    }
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        step(1);
      }
    }, 6000);
    return () => window.clearInterval(id);
  }, [paused, step, videos.length]);

  if (videos.length === 0) {
    return null;
  }

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: hover/focus only pause auto-advance (WCAG 2.2.2); every control stays a real button or link
    <section
      aria-label="ZOOKA VIDEO STREAM"
      aria-roledescription={ar ? "شريط فيديو" : "carousel"}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setPaused(false);
        }
      }}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
          ZOOKA VIDEO STREAM
        </p>
        <div className="flex gap-2">
          <button
            aria-label={ar ? "الفيديو السابق" : "Previous video"}
            className="border-border hover:bg-muted focus-visible:ring-ring inline-flex size-11 items-center justify-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none"
            onClick={() => step(-1)}
            type="button"
          >
            {ar ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>
          <button
            aria-label={ar ? "الفيديو التالي" : "Next video"}
            className="border-border hover:bg-muted focus-visible:ring-ring inline-flex size-11 items-center justify-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none"
            onClick={() => step(1)}
            type="button"
          >
            {ar ? (
              <ChevronLeft className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        </div>
      </div>

      <ul
        className="-mx-1 flex snap-x snap-mandatory [scrollbar-width:thin] gap-4 overflow-x-auto scroll-smooth px-1 pb-3 motion-reduce:scroll-auto"
        data-testid="video-stream-track"
        ref={track}
      >
        {videos.map((video, index) => (
          <li
            aria-label={`${index + 1} / ${videos.length}`}
            aria-roledescription={ar ? "بطاقة فيديو" : "slide"}
            className="w-[78%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]"
            key={video.id}
          >
            <Link
              className="group border-border bg-card focus-visible:ring-ring block overflow-hidden rounded-2xl border transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transform-none"
              href={hrefFor(video)}
            >
              <div className="bg-muted relative aspect-video overflow-hidden">
                {/* biome-ignore lint/performance/noImgElement: plain lazy poster keeps the strip free of image-optimizer requests */}
                <img
                  alt=""
                  className={`h-full w-full ${video.height > video.width ? "object-contain" : "object-cover"} transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none`}
                  decoding="async"
                  height={360}
                  loading="lazy"
                  src={video.thumbnail}
                  width={640}
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex size-12 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/30 backdrop-blur-sm">
                    <Play
                      className="size-5 translate-x-px"
                      fill="currentColor"
                    />
                  </span>
                </span>
                <span className="absolute end-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
                  {formatDuration(video.duration)}
                </span>
                <span className="absolute start-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                  {video.platform === "site" ? "zooka-ai.com" : video.platform}
                </span>
                {showDraftBadge && video.visibility === "review" ? (
                  <span className="absolute end-2 top-2 rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-medium text-black">
                    {ar ? "مسودة للمراجعة" : "Draft for review"}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 p-4">
                <h3 className="line-clamp-1 font-medium">
                  {video.title[lang]}
                </h3>
                <p className="text-muted-foreground text-xs">
                  <time dateTime={video.publishDate}>{video.publishDate}</time>
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
