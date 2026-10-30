"use client";

/**
 * Neural backdrop + live integrations orbiting the globe.
 * Pure CSS (no extra dependencies) so it cannot break the Vercel build.
 */
const ORBIT_INNER = [
  { label: "n8n", color: "#ea4b71" },
  { label: "Gmail", color: "#ea4335" },
  { label: "Drive", color: "#4285f4" },
  { label: "Sheets", color: "#0f9d58" },
];

const ORBIT_OUTER = [
  { label: "WhatsApp", color: "#25d366" },
  { label: "Stripe", color: "#635bff" },
  { label: "Calendar", color: "#4285f4" },
  { label: "Zoho", color: "#e42527" },
];

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="zoka-badge">
      <span
        aria-hidden
        className="zoka-badge-dot"
        style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
      />
      <span className="zoka-badge-label">{label}</span>
    </span>
  );
}

export function IntegrationOrbit({ size = 300 }: { size?: number }) {
  const outer = size + 120;
  const inner = size + 46;

  return (
    <div
      aria-hidden="true"
      className="zoka-orbit-root"
      style={{ height: outer + 96, width: outer + 24 }}
    >
      <style>{`
        .zoka-orbit-root { position: relative; display: flex; align-items: center; justify-content: center; }
        .zoka-neural {
          position: absolute; inset: -12%;
          border-radius: 9999px;
          background:
            radial-gradient(circle at 30% 28%, rgba(99,102,241,.28), transparent 46%),
            radial-gradient(circle at 70% 32%, rgba(34,211,238,.22), transparent 48%),
            radial-gradient(circle at 52% 74%, rgba(168,85,247,.24), transparent 52%);
          filter: blur(26px);
          animation: zoka-breathe 9s ease-in-out infinite;
        }
        .zoka-grid {
          position: absolute; inset: 0; border-radius: 9999px;
          background-image:
            linear-gradient(rgba(148,163,184,.16) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,.16) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: radial-gradient(circle, #000 38%, transparent 72%);
          -webkit-mask-image: radial-gradient(circle, #000 38%, transparent 72%);
          opacity: .55;
        }
        .zoka-ring { position: absolute; border-radius: 9999px; border: 1px dashed rgba(148,163,184,.32); }
        .zoka-ring-in { animation: zoka-spin 26s linear infinite; }
        .zoka-ring-out { animation: zoka-spin 42s linear infinite reverse; }
        .zoka-node { position: absolute; transform: translate(-50%,-50%); }
        .zoka-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 10px; border-radius: 9999px;
          border: 1px solid rgba(148,163,184,.38);
          background: rgba(9,9,14,.72);
          color: #e5e7eb; font-size: 11px; font-weight: 600;
          white-space: nowrap; backdrop-filter: blur(6px);
          animation: zoka-upright 26s linear infinite;
          box-shadow: 0 0 18px rgba(99,102,241,.18);
        }
        .zoka-ring-out .zoka-badge { animation-duration: 42s; animation-direction: reverse; }
        .zoka-badge-dot { width: 7px; height: 7px; border-radius: 9999px; display: inline-block; }
        @keyframes zoka-spin { to { transform: rotate(360deg); } }
        @keyframes zoka-upright { to { transform: rotate(-360deg); } }
        @keyframes zoka-breathe { 0%,100% { opacity: .75; transform: scale(1); } 50% { opacity: 1; transform: scale(1.04); } }
        @media (prefers-reduced-motion: reduce) {
          .zoka-ring-in, .zoka-ring-out, .zoka-badge, .zoka-neural { animation: none !important; }
        }
      `}</style>

      <div className="zoka-neural" />
      <div className="zoka-grid" />

      <div
        className="zoka-ring zoka-ring-out"
        style={{ height: outer, width: outer }}
      >
        {ORBIT_OUTER.map((item, i) => {
          const angle = (360 / ORBIT_OUTER.length) * i - 90;
          return (
            <div
              className="zoka-node"
              key={item.label}
              style={{
                left: `${50 + 50 * Math.cos((angle * Math.PI) / 180)}%`,
                top: `${50 + 50 * Math.sin((angle * Math.PI) / 180)}%`,
              }}
            >
              <Badge color={item.color} label={item.label} />
            </div>
          );
        })}
      </div>

      <div
        className="zoka-ring zoka-ring-in"
        style={{ height: inner, width: inner }}
      >
        {ORBIT_INNER.map((item, i) => {
          const angle = (360 / ORBIT_INNER.length) * i + 45;
          return (
            <div
              className="zoka-node"
              key={item.label}
              style={{
                left: `${50 + 50 * Math.cos((angle * Math.PI) / 180)}%`,
                top: `${50 + 50 * Math.sin((angle * Math.PI) / 180)}%`,
              }}
            >
              <Badge color={item.color} label={item.label} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
