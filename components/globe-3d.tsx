"use client";

import { useEffect, useRef } from "react";

type Vec3 = { x: number; y: number; z: number };

const MARKERS: { lat: number; lon: number; label: string }[] = [
  { lat: 25.2, lon: 55.27, label: "Dubai" },
  { lat: 24.47, lon: 54.37, label: "Abu Dhabi" },
  { lat: 24.71, lon: 46.68, label: "Riyadh" },
  { lat: 30.04, lon: 31.24, label: "Cairo" },
  { lat: 51.51, lon: -0.13, label: "London" },
  { lat: 40.71, lon: -74.0, label: "New York" },
  { lat: 1.35, lon: 103.82, label: "Singapore" },
];

function toVec(lat: number, lon: number): Vec3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return {
    x: -Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  };
}

// Even distribution of dots over the sphere (Fibonacci lattice).
function buildDots(count: number): Vec3[] {
  const dots: Vec3[] = [];
  const offset = 2 / count;
  const increment = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = i * offset - 1 + offset / 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * increment;
    dots.push({ x: Math.cos(phi) * r, y, z: Math.sin(phi) * r });
  }
  return dots;
}

/**
 * Dependency-free 3D globe. Dots are real 3D points rotated on their own
 * axes and projected orthographically, so it reads as a rotating sphere on
 * every device without pulling in WebGL libraries.
 */
export function Globe3D({ size = 260 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dots = buildDots(900);
    const markers = MARKERS.map((m) => ({ ...m, v: toVec(m.lat, m.lon) }));
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.42;
    let angle = 0;
    let frame = 0;
    const speed = 0.0022;

    const rotate = (v: Vec3, a: number): Vec3 => {
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return { x: v.x * cos - v.z * sin, y: v.y, z: v.x * sin + v.z * cos };
    };

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      // soft halo behind the sphere
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 1.25);
      halo.addColorStop(0, "rgba(59,130,246,0.16)");
      halo.addColorStop(0.6, "rgba(99,102,241,0.07)");
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.25, 0, Math.PI * 2);
      ctx.fill();

      // sphere body
      const body = ctx.createRadialGradient(
        cx - radius * 0.35,
        cy - radius * 0.4,
        radius * 0.1,
        cx,
        cy,
        radius
      );
      body.addColorStop(0, "rgba(37,99,235,0.20)");
      body.addColorStop(0.7, "rgba(30,64,175,0.10)");
      body.addColorStop(1, "rgba(15,23,42,0.05)");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // dotted surface
      for (const dot of dots) {
        const p = rotate(dot, angle);
        const depth = (p.z + 1) / 2; // 0 back .. 1 front
        if (depth <= 0.02) continue;
        const px = cx + p.x * radius;
        const py = cy - p.y * radius;
        const alpha = 0.1 + depth * 0.5;
        const dotSize = 0.55 + depth * 1.15;
        ctx.fillStyle = `rgba(96,165,250,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // markers + pulse rings on visible side
      const pulse = (frame % 120) / 120;
      for (const marker of markers) {
        const p = rotate(marker.v, angle);
        if (p.z <= 0.05) continue;
        const px = cx + p.x * radius;
        const py = cy - p.y * radius;
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 14);
        glow.addColorStop(0, "rgba(56,189,248,0.95)");
        glow.addColorStop(0.35, "rgba(56,189,248,0.35)");
        glow.addColorStop(1, "rgba(56,189,248,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(224,242,254,0.95)";
        ctx.beginPath();
        ctx.arc(px, py, 2.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(56,189,248,${(0.45 * (1 - pulse)).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, 4 + pulse * 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      // subtle rim light to sell the sphere
      ctx.strokeStyle = "rgba(147,197,253,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      if (!reduce) {
        angle += speed;
        frame += 1;
        raf = requestAnimationFrame(draw);
      }
    };

    let raf = 0;
    draw();

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [size]);

  return (
    <div className="relative flex items-center justify-center" aria-hidden="true">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}

export default Globe3D;
