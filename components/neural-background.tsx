"use client";

import { useEffect, useRef } from "react";

type Node = { x: number; y: number; vx: number; vy: number; phase: number };

const LINK_DISTANCE = 140;
const MAX_NODES = 70;
const MAX_DPR = 2;

/**
 * Animated neural-network backdrop for the chat.
 *
 * Built to stay out of the way:
 * - `pointer-events-none` and `aria-hidden`: it never steals clicks or focus.
 * - Respects `prefers-reduced-motion` (draws one still frame).
 * - Pauses while the tab is hidden and caps the pixel ratio and node count,
 *   so it costs almost nothing on phones.
 * - Takes its colour from the theme (`text-primary`), so it works in light
 *   and dark mode without extra configuration.
 */
export function NeuralBackground({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!(canvas && context)) {
      return;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let nodes: Node[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;
    let color = "99, 102, 241";

    const readColor = () => {
      const match = getComputedStyle(canvas).color.match(/\d+(\.\d+)?/g);
      if (match && match.length >= 3) {
        color = `${match[0]}, ${match[1]}, ${match[2]}`;
      }
    };

    const seed = () => {
      const count = Math.min(
        MAX_NODES,
        Math.max(18, Math.round((width * height) / 18_000))
      );
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      readColor();
      seed();
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      for (const node of nodes) {
        if (!reducedMotion) {
          node.x += node.vx;
          node.y += node.vy;
          if (node.x < 0 || node.x > width) {
            node.vx *= -1;
          }
          if (node.y < 0 || node.y > height) {
            node.vy *= -1;
          }
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance < LINK_DISTANCE) {
            const alpha = (1 - distance / LINK_DISTANCE) * 0.22;
            context.strokeStyle = `rgba(${color}, ${alpha})`;
            context.lineWidth = 0.8;
            context.beginPath();
            context.moveTo(a.x, a.y);
            context.lineTo(b.x, b.y);
            context.stroke();
          }
        }
      }
      for (const node of nodes) {
        const pulse = reducedMotion
          ? 0.5
          : 0.5 + 0.5 * Math.sin(time / 900 + node.phase);
        context.fillStyle = `rgba(${color}, ${0.25 + pulse * 0.35})`;
        context.beginPath();
        context.arc(node.x, node.y, 1.4 + pulse * 1.2, 0, Math.PI * 2);
        context.fill();
      }
    };

    const loop = (time: number) => {
      if (!running) {
        return;
      }
      draw(time);
      frame = window.requestAnimationFrame(loop);
    };

    const onVisibility = () => {
      if (reducedMotion) {
        return;
      }
      if (document.hidden) {
        running = false;
        window.cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        frame = window.requestAnimationFrame(loop);
      }
    };

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (reducedMotion) {
        draw(0);
      }
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);

    if (reducedMotion) {
      draw(0);
    } else {
      frame = window.requestAnimationFrame(loop);
    }

    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 size-full text-primary opacity-60 dark:opacity-70 ${className}`}
      ref={canvasRef}
    />
  );
}
