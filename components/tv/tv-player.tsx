"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { formatDuration, type TvVideo } from "@/lib/tv/videos";

type Lang = "ar" | "en";

/**
 * The AI TV player. The native controls give play/pause, mute, fullscreen,
 * progress and the captions menu on every browser; we add the title, source,
 * captions tracks and a share action. Nothing autoplays.
 */
export function TvPlayer({ video, lang }: { video: TvVideo; lang: Lang }) {
  const ar = lang === "ar";
  const [copied, setCopied] = useState(false);
  // Brand videos ship an Arabic cut (default) and an English cut. Visitors pick
  // the voice-over; the page language only sets the starting choice.
  const [voice, setVoice] = useState<Lang>(
    video.englishVersion && !ar ? "en" : video.language === "en" ? "en" : "ar"
  );
  const useEnglishCut = voice === "en" && Boolean(video.englishVersion);
  const mainSource = useEnglishCut ? video.englishVersion : video.sourceUrl;
  const verticalSource = useEnglishCut ? video.englishVertical : video.vertical;
  const pageUrl = `https://zooka-ai.com/tv?v=${video.id}`;

  async function share() {
    const data = { title: video.title[lang], url: pageUrl };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The visitor closed the share sheet; nothing to report.
    }
  }

  const portrait = video.height > video.width;

  return (
    <article className="flex flex-col gap-4" data-testid="tv-player">
      <div
        className={`border-border overflow-hidden rounded-2xl border bg-black ${portrait ? "mx-auto aspect-[9/16] h-[min(70vh,640px)] max-w-full" : "aspect-video"}`}
      >
        {/* biome-ignore lint/a11y/useMediaCaption: caption tracks are rendered below when the video has speech; silent product clips have none */}
        <video
          className="h-full w-full"
          controls
          crossOrigin="anonymous"
          key={`${video.id}-${voice}`}
          playsInline
          poster={video.thumbnail}
          preload="metadata"
        >
          {verticalSource ? (
            <source
              media="(max-width: 640px) and (orientation: portrait)"
              src={verticalSource}
              type="video/mp4"
            />
          ) : null}
          <source src={mainSource} type="video/mp4" />
          {video.captions?.ar ? (
            <track
              default={ar}
              kind="captions"
              label="العربية"
              src={video.captions.ar}
              srcLang="ar"
            />
          ) : null}
          {video.captions?.en ? (
            <track
              default={!ar}
              kind="captions"
              label="English"
              src={video.captions.en}
              srcLang="en"
            />
          ) : null}
        </video>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-2">
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span className="border-border rounded-full border px-2 py-0.5">
              {video.platform === "site" ? "zooka-ai.com" : video.platform}
            </span>
            <span className="font-mono">{formatDuration(video.duration)}</span>
            <time dateTime={video.publishDate}>{video.publishDate}</time>
            {video.captions ? (
              <span>{ar ? "ترجمة: عربي · English" : "Captions: AR · EN"}</span>
            ) : null}
            {video.visibility === "review" ? (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 font-medium text-black">
                {ar
                  ? "مسودة للمراجعة — لا تظهر على الموقع الرسمي"
                  : "Draft for review — hidden on production"}
              </span>
            ) : null}
          </div>
          <h2 className="text-2xl font-semibold">{video.title[lang]}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {video.description[lang]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {video.englishVersion ? (
            <fieldset className="border-border inline-flex rounded-lg border p-1">
              <legend className="sr-only">
                {ar ? "لغة التعليق الصوتي" : "Voice-over language"}
              </legend>
              {(["ar", "en"] as const).map((option) => (
                <button
                  aria-pressed={voice === option}
                  className={`focus-visible:ring-ring min-h-9 rounded-md px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none ${voice === option ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  key={option}
                  onClick={() => setVoice(option)}
                  type="button"
                >
                  {option === "ar" ? "العربية" : "English"}
                </button>
              ))}
            </fieldset>
          ) : null}
          <button
            className="border-border hover:bg-muted focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            onClick={share}
            type="button"
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Share2 className="size-4" />
            )}
            {copied
              ? ar
                ? "تم نسخ الرابط"
                : "Link copied"
              : ar
                ? "مشاركة"
                : "Share"}
          </button>
        </div>
      </div>
    </article>
  );
}
