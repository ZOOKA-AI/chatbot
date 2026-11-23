"use client";

import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, type TvVideo } from "@/lib/tv/videos";

type Lang = "ar" | "en";

/**
 * ZOOKA VIDEO STREAM — a horizontal strip of video cards.
 *
 * - Cards sit side by side and drift continuously as one looping strip.
 * - Arrow buttons move it right/left; on phones it can also be swiped.
 * - The motion pauses on hover, on keyboard focus, when the tab is hidden,
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
  // Manual moves (arrows, swipe) hold the auto-scroll briefly so they
  // don't fight each other.
  const holdUntil = useRef(0);
  const position = useRef<number | null>(null);
  // Repeat the list so the strip can loop forever without a visible jump.
  const loop = videos.length > 1;
  const items = loop ? [...videos, ...videos] : videos;

  const half = useCallback(() => {
    const el = track.current;
    return el ? el.scrollWidth / 2 : 0;
  }, []);

  const wrap = useCallback(() => {
    const el = track.current;
    if (!el || !loop) {
      return;
    }
    const h = half();
    if (el.scrollLeft >= h) {
      el.scrollLeft -= h;
    } else if (el.scrollLeft <= 0) {
      el.scrollLeft += h;
    }
    position.current = el.scrollLeft;
  }, [half, loop]);

  const step = useCallback(
    (direction: 1 | -1) => {
      const el = track.current;
      if (!el) {
        return;
      }
      holdUntil.current = performance.now() + 900;
      const card = el.querySelector<HTMLElement>("li");
      const width = (card?.offsetWidth ?? 280) + 16;
      // The track is laid out left-to-right; in Arabic "next" is to the left.
      const sign = ar ? -1 : 1;
      // Jump to the matching spot in the other copy first if this move
      // would hit an edge; the two copies look identical, so it's seamless.
      if (loop) {
        const h = half();
        const target = el.scrollLeft + sign * direction * width;
        if (target <= 0) {
          el.scrollLeft += h;
        } else if (target >= h) {
          el.scrollLeft -= h;
        }
      }
      el.scrollBy({ left: sign * direction * width, behavior: "smooth" });
      window.setTimeout(wrap, 700);
    },
    [ar, half, loop, wrap]
  );

  useEffect(() => {
    const el = track.current;
    if (!el || !loop) {
      return;
    }
    // Start in the middle copy so both directions have room.
    el.scrollLeft = half() / 2;
    position.current = el.scrollLeft;
  }, [half, loop]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const el = track.current;
    if (!el || reduce.matches || paused || !loop) {
      return;
    }
    // ~40px per second: slow enough to read every title.
    const speed = 0.04;
    // Arabic content drifts to the right, English to the left.
    const sign = ar ? -1 : 1;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      if (document.visibilityState === "visible" && now > holdUntil.current) {
        if (position.current === null) {
          position.current = el.scrollLeft;
        }
        position.current += sign * speed * dt;
        const h = half();
        if (position.current >= h) {
          position.current -= h;
        } else if (position.current <= 0) {
          position.current += h;
        }
        el.scrollLeft = position.current;
      } else {
        position.current = el.scrollLeft;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ar, half, loop, paused]);

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
        className="-mx-1 flex [scrollbar-width:none] gap-4 overflow-x-auto px-1 pb-3 [&::-webkit-scrollbar]:hidden"
        data-testid="video-stream-track"
        dir="ltr"
        onTouchEnd={() => {
          holdUntil.current = performance.now() + 1500;
          window.setTimeout(wrap, 600);
        }}
        onTouchStart={() => {
          holdUntil.current = performance.now() + 60_000;
        }}
        ref={track}
      >
        {items.map((video, index) => {
          const copy = index >= videos.length;
          return (
            <li
              aria-hidden={copy || undefined}
              aria-label={copy ? undefined : `${index + 1} / ${videos.length}`}
              aria-roledescription={ar ? "بطاقة فيديو" : "slide"}
              className="w-[78%] shrink-0 sm:w-[46%] lg:w-[31%]"
              dir={ar ? "rtl" : "ltr"}
              key={`${video.id}-${copy ? "b" : "a"}`}
            >
              <Link
                className="group border-border bg-card focus-visible:ring-ring block overflow-hidden rounded-2xl border transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transform-none"
                href={hrefFor(video)}
                tabIndex={copy ? -1 : undefined}
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
                    {video.platform === "site"
                      ? "zooka-ai.com"
                      : video.platform}
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
                    <time dateTime={video.publishDate}>
                      {video.publishDate}
                    </time>
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
