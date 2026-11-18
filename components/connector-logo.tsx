/**
 * The app mark for an integration, drawn locally.
 *
 * No external image is fetched and no third-party logo file is bundled: a
 * provider's official artwork is its trademark, and a wrong-looking copy is
 * worse than an honest tile. So each integration gets a tile in its own brand
 * colour carrying its initials, which reads as that app's icon at 36px without
 * pretending to be the official asset. When the owner supplies real SVG assets,
 * only this file changes.
 */
const BRANDS: Record<string, { bg: string; fg: string; label: string }> = {
  github: { bg: "#24292f", fg: "#ffffff", label: "GH" },
  vercel: { bg: "#000000", fg: "#ffffff", label: "V" },
  x: { bg: "#000000", fg: "#ffffff", label: "X" },
  slack: { bg: "#4a154b", fg: "#ffffff", label: "SL" },
  notion: { bg: "#ffffff", fg: "#111111", label: "N" },
  twilio: { bg: "#f22f46", fg: "#ffffff", label: "TW" },
  shopify: { bg: "#95bf47", fg: "#ffffff", label: "SH" },
  tiktok: { bg: "#010101", fg: "#ffffff", label: "TT" },
  cloudflare: { bg: "#f38020", fg: "#ffffff", label: "CF" },
  stripe: { bg: "#635bff", fg: "#ffffff", label: "ST" },
  supabase: { bg: "#3ecf8e", fg: "#0b1f16", label: "SB" },
  n8n: { bg: "#ea4b71", fg: "#ffffff", label: "n8" },
  gmail: { bg: "#ea4335", fg: "#ffffff", label: "GM" },
  google_drive: { bg: "#0f9d58", fg: "#ffffff", label: "GD" },
  google_calendar: { bg: "#4285f4", fg: "#ffffff", label: "GC" },
  google_ads: { bg: "#fbbc04", fg: "#3c2c00", label: "GA" },
  google_maps: { bg: "#34a853", fg: "#ffffff", label: "MP" },
  google_business: { bg: "#4285f4", fg: "#ffffff", label: "GB" },
  instagram: { bg: "#e1306c", fg: "#ffffff", label: "IG" },
  meta: { bg: "#1877f2", fg: "#ffffff", label: "f" },
  snapchat: { bg: "#fffc00", fg: "#111111", label: "SC" },
  linkedin: { bg: "#0a66c2", fg: "#ffffff", label: "in" },
  telegram_bot: { bg: "#26a5e4", fg: "#ffffff", label: "TG" },
  telegram_ads: { bg: "#26a5e4", fg: "#ffffff", label: "TA" },
  whatsapp: { bg: "#25d366", fg: "#ffffff", label: "WA" },
  improvmx: { bg: "#2b2d42", fg: "#ffffff", label: "IM" },
  namecheap: { bg: "#de3723", fg: "#ffffff", label: "NC" },
  ryze: { bg: "#6d28d9", fg: "#ffffff", label: "RZ" },
  open_banking: { bg: "#0f766e", fg: "#ffffff", label: "OB" },
  flights: { bg: "#1d4ed8", fg: "#ffffff", label: "FL" },
  booking: { bg: "#003580", fg: "#ffffff", label: "BK" },
};

export function ConnectorLogo({
  providerId,
  size = 36,
}: {
  providerId: string;
  size?: number;
}) {
  const brand = BRANDS[providerId] ?? {
    bg: "#334155",
    fg: "#ffffff",
    label: providerId.slice(0, 2).toUpperCase(),
  };
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-semibold"
      style={{
        background: brand.bg,
        color: brand.fg,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        letterSpacing: "-0.02em",
      }}
    >
      {brand.label}
    </span>
  );
}
