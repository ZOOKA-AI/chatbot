/**
 * Sponsor slots shown on the home page.
 *
 * Real advertisers go in ADVERTISERS once a contract is signed (name, logo
 * URL, landing URL, category, start/end dates). Until then every slot shows as
 * "available" — never a brand that has not agreed to appear.
 */
export type AdCategory = {
  id: string;
  icon: string;
  name: { ar: string; en: string };
};

export type Advertiser = {
  id: string;
  name: string;
  categoryId: string;
  logoUrl: string;
  href: string;
  /** ISO dates; the slot is shown only inside this window. */
  startsAt: string;
  endsAt: string;
};

export const AD_CATEGORIES: AdCategory[] = [
  { id: "cars", icon: "🚗", name: { ar: "سيارات", en: "Cars" } },
  { id: "real-estate", icon: "🏙️", name: { ar: "عقارات", en: "Real estate" } },
  { id: "restaurants", icon: "🍽️", name: { ar: "مطاعم", en: "Restaurants" } },
  { id: "clinics", icon: "🩺", name: { ar: "عيادات", en: "Clinics" } },
  { id: "tech", icon: "💻", name: { ar: "تقنية", en: "Tech" } },
  { id: "travel", icon: "✈️", name: { ar: "سفر", en: "Travel" } },
  { id: "banks", icon: "🏦", name: { ar: "خدمات مالية", en: "Finance" } },
  { id: "retail", icon: "🛍️", name: { ar: "تجزئة", en: "Retail" } },
];

export const ADVERTISERS: Advertiser[] = [];

export function activeAdvertisers(now = new Date()): Advertiser[] {
  return ADVERTISERS.filter(
    (ad) => new Date(ad.startsAt) <= now && now <= new Date(ad.endsAt)
  );
}

/** Case-insensitive match on advertiser name or category name (AR/EN). */
export function matchesAdQuery(
  query: string,
  category: AdCategory,
  advertiser?: Advertiser
) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [category.name.ar, category.name.en, advertiser?.name ?? ""].some(
    (value) => value.toLowerCase().includes(q)
  );
}
