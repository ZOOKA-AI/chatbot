"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AD_CATEGORIES,
  activeAdvertisers,
  matchesAdQuery,
} from "@/lib/ads";

/**
 * Sponsor showcase: square 3D tiles that float in a slow, staggered rhythm
 * (CSS only, paused for reduced-motion users), with a search box to find a
 * company or a service category. Empty slots invite companies to advertise;
 * no brand appears until it is a signed advertiser in lib/ads.ts.
 */
export function AdShowcase({ lang }: { lang: "ar" | "en" }) {
  const ar = lang === "ar";
  const [query, setQuery] = useState("");
  const advertisers = useMemo(() => activeAdvertisers(), []);

  const tiles = AD_CATEGORIES.map((category) => ({
    category,
    advertiser: advertisers.find((ad) => ad.categoryId === category.id),
  })).filter(({ category, advertiser }) =>
    matchesAdQuery(query, category, advertiser)
  );

  return (
    <section
      aria-label={ar ? "مساحات إعلانية" : "Sponsor showcase"}
      className="zk-glass mb-10 rounded-3xl border p-5 md:p-6"
      data-testid="ad-showcase"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-bold text-lg">
            {ar ? "واجهة الشركاء والمعلنين" : "Partners & sponsors"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {ar
              ? "مساحات مثبتة لكبار الشركات — ابحث عن خدمة أو شركة."
              : "Pinned spots for leading brands — search a service or company."}
          </p>
        </div>
        <label className="relative block w-full md:w-64">
          <span className="sr-only">
            {ar ? "ابحث عن خدمة أو شركة" : "Search a service or company"}
          </span>
          <input
            className="w-full rounded-full border bg-background/80 px-4 py-2 text-sm outline-none transition-shadow zk-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ar ? "ابحث: سيارات، عقارات…" : "Search: cars, real estate…"}
            type="search"
            value={query}
          />
        </label>
      </div>

      <ul className="zk-ad-stage mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map(({ category, advertiser }, index) => (
          <li
            className="zk-ad-tile"
            key={category.id}
            style={{ animationDelay: `${(index % 4) * 0.9}s` }}
          >
            <Link
              className="zk-ad-card flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-center"
              href={
                advertiser?.href ??
                `/contact?topic=ads&category=${encodeURIComponent(category.id)}`
              }
              {...(advertiser
                ? { rel: "noopener noreferrer sponsored", target: "_blank" }
                : {})}
            >
              {advertiser ? (
                // biome-ignore lint/performance/noImgElement: sponsor logos are external, sized by CSS.
                <img
                  alt={advertiser.name}
                  className="max-h-16 max-w-[80%] object-contain"
                  loading="lazy"
                  src={advertiser.logoUrl}
                />
              ) : (
                <span aria-hidden className="text-3xl">
                  {category.icon}
                </span>
              )}
              <span className="font-semibold text-sm">
                {advertiser?.name ?? category.name[lang]}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {advertiser
                  ? ar
                    ? "شريك معلن"
                    : "Sponsor"
                  : ar
                    ? "مساحة متاحة · أعلن هنا"
                    : "Available · advertise here"}
              </span>
            </Link>
          </li>
        ))}
        {tiles.length === 0 && (
          <li className="col-span-full py-6 text-center text-muted-foreground text-sm">
            {ar ? "لا توجد نتائج بعد." : "No results yet."}
          </li>
        )}
      </ul>
    </section>
  );
}
