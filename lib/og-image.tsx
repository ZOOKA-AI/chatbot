import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const OG_SIZE = { width: 1200, height: 630 };

export function renderBrandMark(size: number) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.62,
        fontWeight: 800,
      }}
    >
      Z
    </div>
  );
}

export function renderOgImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 36,
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
        color: "white",
      }}
    >
      {renderBrandMark(200)}
      <div style={{ display: "flex", fontSize: 88, fontWeight: 800 }}>
        {SITE_NAME}
      </div>
      <div style={{ display: "flex", fontSize: 36, color: "#c7d2fe" }}>
        AI assistant for your business · zooka-ai.com
      </div>
    </div>,
    OG_SIZE
  );
}

export function renderIcon(size: number) {
  return new ImageResponse(renderBrandMark(size), {
    width: size,
    height: size,
  });
}
