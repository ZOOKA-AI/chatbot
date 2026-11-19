/**
 * تسعير الوحدات الإبداعية (صور/فيديو).
 *
 * القاعدة: السعر يُشتق من تكلفة المزوّد نفسها، لا من رقم مُحبّ، وهامش 75% حدّ
 * أدنى لا هدف. أي تعديل في التكلفة يعيد حساب السعر والوحدات الموزونة تلقائياً،
 * فلا تنكسر المعادلة بصمت.
 */

export const CREATIVE_TARGET_MARGIN = 0.75;

/** معدّل التحويل المعتمد في المحافظ: 68 ألف توكن موزون لكل دولار. */
export const WEIGHTED_TOKENS_PER_USD = 68_000;

export type CreativeKind = "image" | "video";

/**
 * تكلفة المزوّد لكل وحدة بالدولار. القيم الافتراضية تقديرية وتُضبط من البيئة
 * عند معرفة الفاتورة الحقيقية، والسعر يتغيّر معها.
 */
export const PROVIDER_UNIT_COST_USD: Record<CreativeKind, number> = {
  image: Number(process.env.CREATIVE_COST_IMAGE_USD ?? "0.04"),
  video: Number(process.env.CREATIVE_COST_VIDEO_USD ?? "0.35"),
};

export type UnitPrice = {
  kind: CreativeKind;
  costUsd: number;
  priceUsd: number;
  weightedTokens: number;
  margin: number;
};

function ceilToCent(value: number): number {
  return Math.ceil(value * 100) / 100;
}

export function priceForUnit(kind: CreativeKind): UnitPrice {
  const costUsd = PROVIDER_UNIT_COST_USD[kind];
  if (!Number.isFinite(costUsd) || costUsd <= 0) {
    throw new Error(`invalid_provider_cost:${kind}`);
  }
  const priceUsd = ceilToCent(costUsd / (1 - CREATIVE_TARGET_MARGIN));
  return {
    costUsd,
    kind,
    margin: 1 - costUsd / priceUsd,
    priceUsd,
    weightedTokens: Math.ceil(priceUsd * WEIGHTED_TOKENS_PER_USD),
  };
}

export type CreativePack = {
  id: string;
  units: number;
  kind: CreativeKind;
  priceUsd: number;
  /** هامش الحزمة الفعلي بعد حساب السعر. */
  margin: number;
};

/**
 * الحزم تُسعّر بالوحدة نفسها، فلا خصم يهبط بالهامش تحت 75%. الميزة التي
 * تُباع هي الالتزام بالمقدار وثبات السعر، لا خصم يكسر الهامش.
 */
export const CREATIVE_PACKS: readonly CreativePack[] = (
  [
    { id: "creative_images_20", kind: "image", units: 20 },
    { id: "creative_images_60", kind: "image", units: 60 },
    { id: "creative_video_5", kind: "video", units: 5 },
    { id: "creative_video_15", kind: "video", units: 15 },
  ] as const
).map((pack) => {
  const unit = priceForUnit(pack.kind);
  const priceUsd = ceilToCent(unit.priceUsd * pack.units);
  return {
    id: pack.id,
    kind: pack.kind,
    margin: 1 - (unit.costUsd * pack.units) / priceUsd,
    priceUsd,
    units: pack.units,
  };
});
