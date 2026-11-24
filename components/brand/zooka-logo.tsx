import type { CSSProperties } from "react";

/**
 * The ZOOKA-AI mark.
 *
 * Vector by default so it stays crisp at any size and inherits the current
 * colour when `mono` is passed. Geometry is the approved mark: a hexagonal
 * frame, a Z built from three strokes, and three neural nodes.
 */
export function ZookaMark({
  size = 32,
  mono,
  glow = true,
  className,
  style,
}: {
  size?: number;
  mono?: string;
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const stroke = mono ?? "url(#zooka-mark-gradient)";
  const id = "zooka-mark-gradient";
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      role="presentation"
      style={style}
      viewBox="0 0 120 132"
      width={size}
    >
      {mono ? null : (
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#10D4FF" />
            <stop offset="0.55" stopColor="#2E86AB" />
            <stop offset="1" stopColor="#A23B72" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M60 14 L106 40 L106 92 L60 118 L14 92 L14 40 Z"
        fill="none"
        stroke={stroke}
        strokeLinejoin="round"
        strokeWidth={6}
        style={glow && !mono ? { filter: "drop-shadow(0 0 6px rgba(16,212,255,.55))" } : undefined}
      />
      <path
        d="M42 46 H78 L44 84 H80"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={7}
      />
      <circle cx="60" cy="40" fill={stroke} r="4" />
      <circle cx="44" cy="96" fill={stroke} r="3" />
      <circle cx="80" cy="62" fill={stroke} r="3" />
    </svg>
  );
}

export function ZookaWordmark({ size = 28, subtitle }: { size?: number; subtitle?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <ZookaMark size={size} />
      <span className="flex flex-col leading-tight">
        <span style={{ fontSize: size * 0.5, fontWeight: 700, letterSpacing: "0.02em" }}>ZOOKA-AI</span>
        {subtitle ? (
          <span className="text-[0.62rem] text-[#10D4FF]" style={{ letterSpacing: "0.08em" }}>
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
