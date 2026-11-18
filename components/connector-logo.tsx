/**
 * The app mark for an integration, drawn locally as inline SVG.
 *
 * Two rules this file keeps:
 * - Nothing is fetched. No remote image host, no CDN, no next/image domain
 *   allowlist entry: the page must render every mark offline and without a
 *   third-party request.
 * - A mark is drawn only where the shape is simple and unambiguous (Vercel's
 *   triangle, X's cross, Instagram's camera, Telegram's plane). Where the real
 *   logo is a complex illustration, the tile falls back to the provider's
 *   initials in its own brand colour rather than shipping a bad imitation.
 *
 * Nominative use only: these marks identify the provider being connected, they
 * are not ours. Official SVG assets can replace any entry here in one place.
 */
type Mark =
  | { kind: "monogram"; bg: string; fg: string; label: string }
  | { kind: "svg"; bg: string; fg: string; paths: string[]; strokes?: boolean };

const BRANDS: Record<string, Mark> = {
  vercel: { kind: "svg", bg: "#000000", fg: "#ffffff", paths: ["M12 4.5 22 21H2z"] },
  x: {
    kind: "svg",
    bg: "#000000",
    fg: "#ffffff",
    paths: ["M4.5 4.5 19.5 19.5", "M19.5 4.5 4.5 19.5"],
    strokes: true,
  },
  instagram: {
    kind: "svg",
    bg: "linear-gradient(135deg,#f9ce34,#ee2a7b 45%,#6228d7)",
    fg: "#ffffff",
    paths: [
      "M7.5 3.8h9a3.7 3.7 0 0 1 3.7 3.7v9a3.7 3.7 0 0 1-3.7 3.7h-9A3.7 3.7 0 0 1 3.8 16.5v-9A3.7 3.7 0 0 1 7.5 3.8Z",
      "M12 8.3a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4Z",
      "M16.9 7.1h.01",
    ],
    strokes: true,
  },
  telegram_bot: {
    kind: "svg",
    bg: "#26a5e4",
    fg: "#ffffff",
    paths: ["M21 4.6 2.9 11.3l5 1.7 1.7 5.4 2.6-3.5 4 2.6z"],
  },
  telegram_ads: {
    kind: "svg",
    bg: "#26a5e4",
    fg: "#ffffff",
    paths: ["M21 4.6 2.9 11.3l5 1.7 1.7 5.4 2.6-3.5 4 2.6z"],
  },
  whatsapp: {
    kind: "svg",
    bg: "#25d366",
    fg: "#ffffff",
    paths: [
      "M12 3.6a8.4 8.4 0 0 0-7.2 12.7L3.6 20.4l4.2-1.1A8.4 8.4 0 1 0 12 3.6Z",
      "M8.9 8.3c.5-.2.8 0 1 .4l.6 1.3c.1.3 0 .5-.2.7l-.4.4c.6 1.2 1.5 2 2.6 2.5l.4-.5c.2-.2.4-.2.7-.1l1.3.6c.3.2.4.5.3 1-.2.8-.9 1.4-1.7 1.4-2.7 0-5.3-2.6-5.3-5.3 0-.8.5-1.5 1.3-1.7Z",
    ],
  },
  supabase: { kind: "svg", bg: "#3ecf8e", fg: "#0b1f16", paths: ["M13.4 2.5 4 13.6h7.2V21l9.4-11.1h-7.2z"] },
  cloudflare: {
    kind: "svg",
    bg: "#f38020",
    fg: "#ffffff",
    paths: ["M7.2 18h9.6a3.2 3.2 0 0 0 .3-6.4A5.6 5.6 0 0 0 6.6 10a3.9 3.9 0 0 0 .6 8Z"],
  },
  gmail: {
    kind: "svg",
    bg: "#ea4335",
    fg: "#ffffff",
    paths: ["M3.5 7.2 12 13.2l8.5-6v9.6h-17z", "M3.5 7.2v9.6h2.6V9.8z", "M17.9 9.8v7h2.6V7.2z"],
  },
  google_drive: {
    kind: "svg",
    bg: "#ffffff",
    fg: "#0f9d58",
    paths: ["M9.4 3.5h5.2L21 15.4h-5.2z", "M9.4 3.5 3 15.4l2.6 4.5 6.4-11.9z", "M5.6 19.9 8.2 15.4h12.8l-2.6 4.5z"],
  },
  google_calendar: {
    kind: "svg",
    bg: "#ffffff",
    fg: "#4285f4",
    paths: ["M5 4.8h14v14.4H5z", "M5 8.6h14", "M9.2 11.4h2.2v2.2H9.2z"],
    strokes: true,
  },
  linkedin: { kind: "svg", bg: "#0a66c2", fg: "#ffffff", paths: ["M6.6 9.4h2.6v8.2H6.6zM7.9 5.6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.2 9.4h2.5v1.1c.4-.7 1.2-1.3 2.4-1.3 1.9 0 2.7 1.2 2.7 3.3v5.1h-2.6v-4.6c0-1-.3-1.6-1.2-1.6-.8 0-1.3.6-1.3 1.6v4.6h-2.5z"] },
  meta: {
    kind: "svg",
    bg: "#1877f2",
    fg: "#ffffff",
    paths: ["M7.4 9.2c1.3 0 2.2 1.3 3 2.6.6 1 1 1.6 1.6 1.6.7 0 1.1-.7 1.1-2 0-2.4-1-3.6-2.6-3.6-1.6 0-2.7 1.1-3.1 1.4Z", "M12.6 14.8c.8 0 1.4-.6 2.2-1.9.8-1.3 1.7-2.5 3-2.5 1.6 0 2.6 1.2 2.6 3.6 0 1.3-.4 2-1.1 2-.6 0-1-.6-1.6-1.6-.8-1.3-1.7-2.6-3-2.6"],
    strokes: true,
  },
  stripe: { kind: "monogram", bg: "#635bff", fg: "#ffffff", label: "S" },
  notion: { kind: "monogram", bg: "#ffffff", fg: "#111111", label: "N" },
  n8n: {
    kind: "svg",
    bg: "#ea4b71",
    fg: "#ffffff",
    paths: ["M6 12a2 2 0 1 0 0-.01", "M12 7.2a2 2 0 1 0 0-.01", "M18 12a2 2 0 1 0 0-.01", "M8 11 10.2 8.4", "M13.8 8.4 16 11"],
    strokes: true,
  },
  tiktok: {
    kind: "svg",
    bg: "#010101",
    fg: "#ffffff",
    paths: ["M13.4 4v9.6a2.6 2.6 0 1 1-2.6-2.6", "M13.4 4c.3 2 1.7 3.4 3.8 3.6"],
    strokes: true,
  },
  slack: {
    kind: "svg",
    bg: "#4a154b",
    fg: "#ffffff",
    paths: ["M9.2 4.6v6.2", "M14.8 9.2h-6.2", "M14.8 19.4v-6.2", "M9.2 14.8h6.2"],
    strokes: true,
  },
  github: { kind: "monogram", bg: "#24292f", fg: "#ffffff", label: "GH" },
  snapchat: { kind: "monogram", bg: "#fffc00", fg: "#111111", label: "SC" },
  shopify: { kind: "monogram", bg: "#95bf47", fg: "#ffffff", label: "SH" },
  twilio: { kind: "monogram", bg: "#f22f46", fg: "#ffffff", label: "TW" },
  namecheap: { kind: "monogram", bg: "#de3723", fg: "#ffffff", label: "NC" },
  improvmx: { kind: "monogram", bg: "#2b2d42", fg: "#ffffff", label: "IM" },
  ryze: { kind: "monogram", bg: "#6d28d9", fg: "#ffffff", label: "RZ" },
  google_ads: { kind: "monogram", bg: "#fbbc04", fg: "#3c2c00", label: "GA" },
  google_maps: { kind: "monogram", bg: "#34a853", fg: "#ffffff", label: "MP" },
  google_business: { kind: "monogram", bg: "#4285f4", fg: "#ffffff", label: "GB" },
  open_banking: { kind: "monogram", bg: "#0f766e", fg: "#ffffff", label: "OB" },
  flights: { kind: "monogram", bg: "#1d4ed8", fg: "#ffffff", label: "FL" },
  booking: { kind: "monogram", bg: "#003580", fg: "#ffffff", label: "BK" },
  video_calls: { kind: "monogram", bg: "#334155", fg: "#ffffff", label: "VC" },
};

export function ConnectorLogo({
  providerId,
  size = 36,
}: {
  providerId: string;
  size?: number;
}) {
  const mark: Mark = BRANDS[providerId] ?? {
    kind: "monogram",
    bg: "#334155",
    fg: "#ffffff",
    label: providerId.slice(0, 2).toUpperCase(),
  };

  const tileStyle = {
    background: mark.bg,
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.28),
  } as const;

  if (mark.kind === "monogram") {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center font-semibold"
        style={{ ...tileStyle, color: mark.fg, fontSize: Math.round(size * 0.38) }}
      >
        {mark.label}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center"
      style={tileStyle}
    >
      <svg
        fill={mark.strokes ? "none" : mark.fg}
        height={Math.round(size * 0.62)}
        stroke={mark.strokes ? mark.fg : "none"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={mark.strokes ? 1.7 : 0}
        viewBox="0 0 24 24"
        width={Math.round(size * 0.62)}
      >
        {mark.paths.map((d) => (
          <path d={d} key={d} />
        ))}
      </svg>
    </span>
  );
}
