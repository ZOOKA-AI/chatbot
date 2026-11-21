import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BrandIntro } from "@/components/marketing/brand-intro";

/**
 * The brand card is a public landing surface, so the rules are asserted on the
 * markup itself: it must not autoplay, it must ship a poster, and it must keep
 * working when the file is unavailable.
 */

const markup = renderToStaticMarkup(createElement(BrandIntro, { lang: "ar" }));
const english = renderToStaticMarkup(createElement(BrandIntro, { lang: "en" }));

describe("brand intro card", () => {
  test("never autoplays and keeps controls for keyboard users", () => {
    expect(markup).not.toContain("autoplay");
    expect(markup).toContain("controls");
    expect(markup).toContain("playsInline");
  });

  test("loads metadata only, so the clip is not downloaded up front", () => {
    expect(markup).toContain('preload="metadata"');
  });

  test("points at assets that exist in the repository", () => {
    expect(markup).toContain('src="/videos/brand/zk-intro-1080x1920.mp4"');
    expect(markup).toContain('poster="/videos/brand/zk-intro-poster.jpg"');
  });

  test("declares intrinsic size so the card does not shift while loading", () => {
    expect(markup).toContain('width="1080"');
    expect(markup).toContain('height="1920"');
  });

  test("carries an accessible label and a direct file link as fallback", () => {
    expect(markup).toContain('aria-label="مقطع تعريفي قصير بهوية ZOOKA-AI الرسمية"');
    expect(markup).toContain('href="/videos/brand/zk-intro-1080x1920.mp4"');
  });

  test("is bilingual", () => {
    expect(markup).toContain("تقنية بإيمان، تقدّم بأخلاق");
    expect(english).toContain("Technology with faith, progress with ethics");
    expect(english).not.toContain("تقنية بإيمان");
  });
});
